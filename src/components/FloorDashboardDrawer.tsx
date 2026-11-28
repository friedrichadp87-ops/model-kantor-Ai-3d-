import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import {
  Briefcase,
  CheckCircle2,
  Coffee,
  Eye,
  Loader2,
  Search,
  Send,
  Users,
  X,
  AlertCircle,
} from 'lucide-react';
import {
  BUILDING_FLOORS,
  FLOOR_ORDER,
  type BuildingSimulationState,
  type FloorId,
} from '../office/buildingFloors';
import {
  FLOOR_QUICK_PROMPTS,
  computeFloorPerformanceMetrics,
  filterFloorEmployees,
  validateFloorAssignment,
  type FloorEmployeeFilter,
} from '../office/floorPerformance';
import type { ShortsQueueItem } from '../office/shortsFactory';
import type { WorkHistoryRecord } from '../firebase/officeSync';
import type { AgentId, LightingPreset, OfficeCommand, TaskEntry } from '../office/types';

interface FloorDashboardDrawerProps {
  buildingState: BuildingSimulationState;
  activeFloorId: FloorId;
  lighting: LightingPreset;
  tasksByFloorAgent: Record<string, TaskEntry[]>;
  workHistory: WorkHistoryRecord[];
  shortsQueue: ShortsQueueItem[];
  onSelectFloor: (floorId: FloorId) => void;
  onFocusEmployeeIn3D: (floorId: FloorId, agentId: AgentId) => void;
  onRunFloorCommand: (floorId: FloorId, command: OfficeCommand) => void;
  onSubmitFloorTask: (floorId: FloorId, agentId: AgentId, prompt: string) => void;
  onClose: () => void;
}

const FILTER_OPTIONS: Array<{ id: FloorEmployeeFilter; label: string }> = [
  { id: 'all', label: 'Semua' },
  { id: 'active', label: 'Aktif' },
  { id: 'idle', label: 'Siaga' },
  { id: 'executing', label: 'Tugas AI' },
];

export function FloorDashboardDrawer({
  buildingState,
  activeFloorId,
  lighting,
  tasksByFloorAgent,
  workHistory,
  shortsQueue,
  onSelectFloor,
  onFocusEmployeeIn3D,
  onRunFloorCommand,
  onSubmitFloorTask,
  onClose,
}: FloorDashboardDrawerProps) {
  const [selectedFloorId, setSelectedFloorId] = useState<FloorId>(activeFloorId);
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId>('scriptwriter');
  const [statusFilter, setStatusFilter] = useState<FloorEmployeeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [prompt, setPrompt] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [dispatchNotice, setDispatchNotice] = useState<string | null>(null);

  const searchInputId = useId();
  const employeeSelectId = useId();
  const promptInputId = useId();

  useEffect(() => {
    setSelectedFloorId(activeFloorId);
  }, [activeFloorId]);

  const metricsByFloor = useMemo(
    () => computeFloorPerformanceMetrics(buildingState, tasksByFloorAgent, shortsQueue),
    [buildingState, tasksByFloorAgent, shortsQueue]
  );

  const activeMetrics = metricsByFloor[selectedFloorId];
  const selectedFloorHistory = useMemo(
    () => workHistory.filter((item) => item.floorId === selectedFloorId).slice(0, 40),
    [workHistory, selectedFloorId]
  );
  const filteredEmployees = useMemo(
    () => filterFloorEmployees(activeMetrics.employees, statusFilter, searchQuery),
    [activeMetrics.employees, statusFilter, searchQuery]
  );

  const selectedEmployee = useMemo(
    () =>
      activeMetrics.employees.find((e) => e.agentId === selectedAgentId) ??
      activeMetrics.employees[0],
    [activeMetrics.employees, selectedAgentId]
  );

  const isDark = lighting === 'malam';

  const surfaceClass = isDark
    ? 'border-slate-700/90 bg-[#0b1322]/97 text-slate-100'
    : 'border-slate-200/95 bg-[#fcfbf8]/97 text-slate-900';

  const dividerClass = isDark ? 'border-slate-800' : 'border-slate-200/90';
  const mutedTextClass = isDark ? 'text-slate-400' : 'text-slate-600';
  const subtleBgClass = isDark ? 'bg-slate-900/75' : 'bg-slate-100/75';
  const inputClass = isDark
    ? 'border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:border-sky-500'
    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-900';

  const handleChooseFloor = (floorId: FloorId, sync3D = true) => {
    setSelectedFloorId(floorId);
    setValidationError(null);
    setDispatchNotice(null);
    if (sync3D) {
      onSelectFloor(floorId);
    }
  };

  const handleApplyPreset = (presetAgentId: AgentId, presetPrompt: string) => {
    setSelectedAgentId(presetAgentId);
    setPrompt(presetPrompt);
    setValidationError(null);
    setDispatchNotice(null);
  };

  const handleAssignSubmit = (e: FormEvent) => {
    e.preventDefault();
    const check = validateFloorAssignment({
      floorId: selectedFloorId,
      agentId: selectedAgentId,
      prompt,
    });
    if (!check.valid || !check.floorId || !check.agentId || !check.trimmedPrompt) {
      setValidationError(check.error ?? 'Periksa kembali lantai, karyawan, dan instruksi tugas.');
      return;
    }

    setValidationError(null);
    const targetCfg = BUILDING_FLOORS[check.floorId];
    onSubmitFloorTask(check.floorId, check.agentId, check.trimmedPrompt);
    setDispatchNotice(
      `Tugas dikirim ke ${selectedEmployee.name} di ${targetCfg.label} (${targetCfg.channelName}).`
    );
    setPrompt('');
  };

  const presets = FLOOR_QUICK_PROMPTS[selectedFloorId];

  return (
    <section
      aria-label="Dasbor Performa dan Penugasan Karyawan 3 Lantai"
      data-testid="floor-dashboard-drawer"
      data-selected-floor={String(selectedFloorId)}
      className={`pointer-events-auto mb-2 w-full rounded-xl border shadow-2xl transition-colors duration-200 ${surfaceClass}`}
    >
      {/* Header Bar */}
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 ${dividerClass}`}>
        <div className="min-w-0">
          <h2 className="text-sm font-bold tracking-tight">
            Utilisasi, Performa &amp; Penugasan 3 Lantai
          </h2>
          <p className={`text-[11px] ${mutedTextClass}`}>
            Pantau 39 karyawan AI dan kirim instruksi langsung ke Lantai 1 (Daily Faith), Lantai 2 (Bible Stories), atau Lantai 3 (Bible Facts)
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Building-Wide Live Utilization Summary (formerly floating top card) */}
          <div className="hidden items-center gap-3 text-xs tabular-nums sm:flex">
            <span className="font-mono text-sm font-bold">
              {Math.round(
                ((metricsByFloor[1].activeAgents +
                  metricsByFloor[2].activeAgents +
                  metricsByFloor[3].activeAgents) /
                  39) *
                  100
              )}
              %
            </span>
            <span className={mutedTextClass}>
              Aktif{' '}
              <strong className={`font-mono font-semibold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                {metricsByFloor[1].activeAgents +
                  metricsByFloor[2].activeAgents +
                  metricsByFloor[3].activeAgents}
                /39
              </strong>
            </span>
            <span className={mutedTextClass} aria-hidden="true">
              ·
            </span>
            <span className={mutedTextClass}>
              Siaga{' '}
              <strong className={`font-mono font-semibold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                {metricsByFloor[1].idleAgents +
                  metricsByFloor[2].idleAgents +
                  metricsByFloor[3].idleAgents}
                /39
              </strong>
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dasbor performa lantai"
            className={`rounded-lg p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
              isDark
                ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 3-Floor Live Performance Comparison Strip (Single-Elevation Hairline Grid) */}
      <div
        className={`grid grid-cols-1 divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0 ${dividerClass} ${
          isDark ? 'divide-slate-800' : 'divide-slate-200/90'
        }`}
      >
        {FLOOR_ORDER.map((fid) => {
          const floor = metricsByFloor[fid];
          const isSelected = selectedFloorId === fid;

          return (
            <div
              key={fid}
              data-testid={`floor-perf-card-${fid}`}
              className={`px-3.5 py-2.5 transition-colors ${
                isSelected
                  ? isDark
                    ? 'bg-slate-800/75'
                    : 'bg-slate-100/85'
                  : 'bg-transparent'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-xs"
                      style={{ backgroundColor: floor.accentHex }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-xs font-bold tracking-tight">
                      Lantai {fid} · {floor.channelName}
                    </span>
                  </div>
                  <p className={`mt-0.5 truncate text-[11px] ${mutedTextClass}`}>
                    {floor.officeModeLabel}
                    <span className="mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono">{floor.geminiEnvVar}</span>
                  </p>
                </div>

                <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                  {floor.utilizationPercent}%
                </span>
              </div>

              {/* Thin Proportional Utilization Bar */}
              <div
                className={`mt-2 h-1.5 w-full overflow-hidden rounded-full ${
                  isDark ? 'bg-slate-800' : 'bg-slate-200'
                }`}
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${floor.utilizationPercent}%`,
                    backgroundColor: floor.accentHex,
                  }}
                />
              </div>

              {/* Clean Unboxed Tabular Metrics */}
              <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums ${mutedTextClass}`}>
                <span>
                  Aktif{' '}
                  <strong className={`font-mono font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {floor.activeAgents}/{floor.totalAgents}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Selesai{' '}
                  <strong className={`font-mono font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {floor.completedTasks}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Berjalan{' '}
                  <strong className={`font-mono font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {floor.runningTasks}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Shorts{' '}
                  <strong className={`font-mono font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {floor.shortsTotalCount}
                  </strong>
                </span>
              </div>

              {/* Per-Floor Interactive Actions */}
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  data-testid={`dashboard-select-floor-${fid}`}
                  onClick={() => handleChooseFloor(fid, true)}
                  aria-pressed={isSelected}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    isSelected
                      ? isDark
                        ? 'bg-slate-100 text-slate-950'
                        : 'bg-slate-900 text-white'
                      : isDark
                      ? 'border border-slate-700 text-slate-200 hover:bg-slate-800'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {isSelected ? 'Lantai Terpilih' : `Kelola Lantai ${fid}`}
                </button>

                <button
                  type="button"
                  onClick={() => onSelectFloor(fid)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    isDark
                      ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Lihat 3D</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Split Workspace: Left = Employee Performance Table | Right = Floor-Specific Assignment Form */}
      <div
        className={`grid grid-cols-1 divide-y lg:grid-cols-12 lg:divide-x lg:divide-y-0 ${
          isDark ? 'divide-slate-800' : 'divide-slate-200/90'
        }`}
      >
        {/* Left: Selected Floor Employee Performance Table */}
        <div className="flex flex-col lg:col-span-7">
          <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 ${dividerClass}`}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className={`pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 ${mutedTextClass}`}
                  aria-hidden="true"
                />
                <label htmlFor={searchInputId} className="sr-only">
                  Cari karyawan di Lantai {selectedFloorId}
                </label>
                <input
                  id={searchInputId}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Cari karyawan L${selectedFloorId}...`}
                  className={`w-44 rounded-lg border py-1 pr-2.5 pl-8 text-xs focus:outline-none ${inputClass}`}
                />
              </div>

              <div
                className={`flex items-center gap-0.5 rounded-lg p-0.5 ${subtleBgClass}`}
                role="group"
                aria-label="Filter status karyawan"
              >
                {FILTER_OPTIONS.map((opt) => {
                  const active = statusFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setStatusFilter(opt.id)}
                      aria-pressed={active}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                        active
                          ? isDark
                            ? 'bg-slate-100 text-slate-950'
                            : 'bg-white text-slate-950 shadow-xs'
                          : isDark
                          ? 'text-slate-300 hover:text-white'
                          : 'text-slate-600 hover:text-slate-950'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Floor-Scoped Routine Controls */}
            <div className="flex items-center gap-1" role="group" aria-label={`Perintah rutin Lantai ${selectedFloorId}`}>
              <button
                type="button"
                onClick={() => onRunFloorCommand(selectedFloorId, 'standup')}
                title={`Arahkan seluruh tim Lantai ${selectedFloorId} ke Ruang Rapat`}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                  activeMetrics.officeMode === 'rapat'
                    ? isDark
                      ? 'border-sky-400 bg-sky-600 text-white'
                      : 'border-slate-900 bg-slate-900 text-white'
                    : isDark
                    ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Users className="h-3 w-3" aria-hidden="true" />
                <span>Rapat L{selectedFloorId}</span>
              </button>
              <button
                type="button"
                onClick={() => onRunFloorCommand(selectedFloorId, 'coffee_break')}
                title={`Arahkan seluruh tim Lantai ${selectedFloorId} untuk Rehat Kopi`}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                  activeMetrics.officeMode === 'istirahat'
                    ? isDark
                      ? 'border-amber-400 bg-amber-600 text-white'
                      : 'border-slate-900 bg-slate-900 text-white'
                    : isDark
                    ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Coffee className="h-3 w-3" aria-hidden="true" />
                <span>Kopi L{selectedFloorId}</span>
              </button>
              <button
                type="button"
                onClick={() => onRunFloorCommand(selectedFloorId, 'back_to_work')}
                title={`Kembalikan tim Lantai ${selectedFloorId} ke meja kerja`}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                  activeMetrics.officeMode === 'kerja'
                    ? isDark
                      ? 'border-emerald-400 bg-emerald-600 text-white'
                      : 'border-slate-900 bg-slate-900 text-white'
                    : isDark
                    ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Briefcase className="h-3 w-3" aria-hidden="true" />
                <span>Kerja L{selectedFloorId}</span>
              </button>
            </div>
          </div>

          {/* High-Density Scannable Employee Performance Table */}
          <div className="max-h-[208px] overflow-y-auto">
            {filteredEmployees.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className={`text-xs ${mutedTextClass}`}>
                  Tidak ada karyawan pada Lantai {selectedFloorId} yang cocok dengan filter saat ini.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setSearchQuery('');
                  }}
                  className={`mt-2 rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                    isDark
                      ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Atur Ulang Filter
                </button>
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead
                  className={`sticky top-0 z-10 border-b text-[11px] font-semibold ${dividerClass} ${
                    isDark ? 'bg-[#0e182b] text-slate-400' : 'bg-slate-50 text-slate-500'
                  }`}
                >
                  <tr>
                    <th scope="col" className="px-4 py-2">Karyawan &amp; Peran</th>
                    <th scope="col" className="px-2 py-2">Status Langsung</th>
                    <th scope="col" className="px-2 py-2 text-right">Tugas</th>
                    <th scope="col" className="px-4 py-2 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-slate-800/80' : 'divide-slate-200/75'}`}>
                  {filteredEmployees.map((emp) => {
                    const isPicked = selectedAgentId === emp.agentId;
                    const statusTextColor = emp.isExecuting
                      ? isDark
                        ? 'text-sky-300'
                        : 'text-blue-700'
                      : emp.bucket === 'active'
                      ? isDark
                        ? 'text-emerald-300'
                        : 'text-emerald-700'
                      : isDark
                      ? 'text-amber-300'
                      : 'text-amber-700';

                    return (
                      <tr
                        key={emp.key}
                        onClick={() => setSelectedAgentId(emp.agentId)}
                        className={`cursor-pointer transition-colors ${
                          isPicked
                            ? isDark
                              ? 'bg-slate-800/90'
                              : 'bg-slate-100'
                            : isDark
                            ? 'hover:bg-slate-900/70'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-2">
                          <div className="font-semibold">{emp.name}</div>
                          <div className={`text-[11px] ${mutedTextClass}`}>{emp.role}</div>
                        </td>
                        <td className="px-2 py-2">
                          <div className={`font-medium ${statusTextColor}`}>
                            {emp.isExecuting ? 'Menjalankan Tugas AI' : emp.activityLabel}
                          </div>
                          <div className={`max-w-[190px] truncate text-[11px] ${mutedTextClass}`}>
                            {emp.statusLabel}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          <span className="font-semibold">{emp.completedTasks}</span>
                          <span className={`ml-1 text-[11px] ${mutedTextClass}`}>
                            {emp.runningTasks > 0 ? `(+${emp.runningTasks})` : 'selesai'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAgentId(emp.agentId);
                              }}
                              className={`rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                                isPicked
                                  ? isDark
                                    ? 'bg-slate-100 text-slate-950'
                                    : 'bg-slate-900 text-white'
                                  : isDark
                                  ? 'border border-slate-700 text-slate-200 hover:bg-slate-800'
                                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {isPicked ? 'Dipilih' : 'Tugaskan'}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onFocusEmployeeIn3D(emp.floorId, emp.agentId);
                              }}
                              title={`Fokus kamera 3D ke ${emp.name}`}
                              aria-label={`Fokus kamera 3D ke ${emp.name}`}
                              className={`rounded-md p-1 transition-colors ${
                                isDark
                                  ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                  : 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'
                              }`}
                            >
                              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Floor-Specific Employee Assignment Form + Recent Floor Activity */}
        <div className="flex flex-col justify-between p-3.5 lg:col-span-5">
          <form onSubmit={handleAssignSubmit} className="space-y-2" data-testid="floor-assignment-form">
            <div>
              <h3 className="text-xs font-bold tracking-tight">
                Penugasan Spesifik Lantai {selectedFloorId} · {activeMetrics.channelName}
              </h3>
              <p className={`mt-0.5 text-[11px] ${mutedTextClass}`}>
                Rute API otomatis: <span className="font-mono">{activeMetrics.geminiEnvVar}</span>
              </p>
            </div>

            {/* Step 1: Target Floor Segmented Control */}
            <div
              className={`grid grid-cols-3 gap-1 rounded-lg p-1 ${subtleBgClass}`}
              role="group"
              aria-label="Pilih lantai tujuan tugas"
            >
              {FLOOR_ORDER.map((fid) => {
                const cfg = BUILDING_FLOORS[fid];
                const active = selectedFloorId === fid;
                const compactTitle =
                  fid === 1 ? 'L1 Daily Faith' : fid === 2 ? 'L2 Bible Stories' : 'L3 Bible Facts';
                return (
                  <button
                    key={fid}
                    type="button"
                    data-testid={`assign-floor-tab-${fid}`}
                    onClick={() => handleChooseFloor(fid, true)}
                    aria-pressed={active}
                    className={`rounded-md px-2 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                      active
                        ? isDark
                          ? 'bg-slate-100 text-slate-950 font-semibold'
                          : 'bg-white text-slate-950 font-semibold shadow-xs'
                        : isDark
                        ? 'text-slate-300 hover:text-white'
                        : 'text-slate-600 hover:text-slate-950'
                    }`}
                  >
                    <span
                      className="mr-1 inline-block h-2 w-2 rounded-xs align-middle"
                      style={{ backgroundColor: cfg.accentHex }}
                      aria-hidden="true"
                    />
                    {compactTitle}
                  </button>
                );
              })}
            </div>

            {/* Step 2: Specific Employee Select */}
            <div>
              <label
                htmlFor={employeeSelectId}
                className={`mb-1 block text-[11px] font-semibold ${mutedTextClass}`}
              >
                Karyawan Tujuan (13 Agen Lantai {selectedFloorId})
              </label>
              <select
                id={employeeSelectId}
                data-testid="assign-employee-select"
                value={selectedAgentId}
                onChange={(e) => {
                  setSelectedAgentId(e.target.value as AgentId);
                  setValidationError(null);
                }}
                className={`w-full rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none ${inputClass}`}
              >
                {activeMetrics.employees.map((emp) => (
                  <option key={emp.key} value={emp.agentId}>
                    {emp.name} — {emp.role} ({emp.isExecuting ? 'Sedang Tugas' : emp.activityLabel})
                  </option>
                ))}
              </select>
            </div>

            {/* Step 3: Channel Quick Presets + Prompt Input */}
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label
                  htmlFor={promptInputId}
                  className={`text-[11px] font-semibold ${mutedTextClass}`}
                >
                  Instruksi Tugas
                </label>
                <span className={`text-[11px] ${mutedTextClass}`}>Pilih preset cepat:</span>
              </div>

              <div className="mb-1.5 flex flex-wrap gap-1">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset.recommendedAgentId, preset.prompt)}
                    className={`rounded-md border px-2 py-1 text-[11px] whitespace-nowrap transition-colors ${
                      isDark
                        ? 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:text-slate-950'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <textarea
                id={promptInputId}
                data-testid="assign-task-prompt"
                rows={2}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setValidationError(null);
                  setDispatchNotice(null);
                }}
                placeholder={`Tulis instruksi spesifik untuk ${selectedEmployee.name} di Lantai ${selectedFloorId}...`}
                className={`w-full resize-none rounded-lg border px-2.5 py-2 text-xs leading-relaxed focus:outline-none ${inputClass}`}
              />
            </div>

            {validationError && (
              <p
                role="alert"
                className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{validationError}</span>
              </p>
            )}

            {dispatchNotice && (
              <p
                role="status"
                data-testid="assign-dispatch-notice"
                className={`flex items-center gap-1.5 text-xs font-medium ${
                  isDark ? 'text-emerald-300' : 'text-emerald-700'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{dispatchNotice}</span>
              </p>
            )}

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <button
                type="submit"
                data-testid="assign-submit-btn"
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                  isDark
                    ? 'bg-slate-100 text-slate-950 hover:bg-white'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  Kirim Tugas ke {selectedEmployee.shortName} (L{selectedFloorId})
                </span>
              </button>
            </div>
          </form>

          {/* Compact Recent Floor Tasks Status */}
          <div className={`mt-2 border-t pt-2 ${dividerClass}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold">Riwayat Tugas Lantai {selectedFloorId}</span>
              <span className={`font-mono tabular-nums ${mutedTextClass}`}>
                {activeMetrics.totalTasks} tugas
                {activeMetrics.completionRatePercent !== null
                  ? ` · ${activeMetrics.completionRatePercent}% sukses`
                  : ''}
              </span>
            </div>

            {activeMetrics.recentTasks.length === 0 ? (
              <p className={`mt-1.5 text-[11px] ${mutedTextClass}`}>
                Belum ada tugas manual di Lantai {selectedFloorId}. Pilih karyawan di atas untuk memulai.
              </p>
            ) : (
              <ul className="mt-1.5 max-h-[76px] space-y-1 overflow-y-auto pr-1">
                {activeMetrics.recentTasks.slice(0, 3).map((task) => (
                  <li
                    key={task.id}
                    className={`flex items-center justify-between gap-2 text-[11px] ${mutedTextClass}`}
                  >
                    <span className="min-w-0 truncate">
                      <strong className={isDark ? 'text-slate-200' : 'text-slate-800'}>
                        {task.employeeName}
                      </strong>
                      <span className="mx-1" aria-hidden="true">
                        ·
                      </span>
                      <span>{task.prompt}</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums">
                      {task.status === 'running' ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin text-blue-500" aria-hidden="true" />
                          <span>Proses</span>
                        </>
                      ) : task.status === 'completed' ? (
                        <span className={isDark ? 'text-emerald-300' : 'text-emerald-700'}>
                          Selesai
                        </span>
                      ) : (
                        <span className={isDark ? 'text-red-400' : 'text-red-600'}>Gagal</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Immutable Firestore audit trail for the selected floor */}
          <div className={`mt-2 border-t pt-2 ${dividerClass}`}>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold">Dokumentasi Pekerjaan AI · Lantai {selectedFloorId}</span>
              <span className={`font-mono tabular-nums ${mutedTextClass}`}>
                {selectedFloorHistory.length} / 40 catatan terbaru
              </span>
            </div>
            {selectedFloorHistory.length === 0 ? (
              <p className={`mt-1.5 text-[11px] ${mutedTextClass}`}>
                Belum ada histori tersinkron. Login Firebase dan jalankan pekerjaan agen agar setiap tahap tercatat di Firestore.
              </p>
            ) : (
              <ol className="mt-1.5 max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
                {selectedFloorHistory.map((item) => {
                  const statusLabel =
                    item.phase === 'completed'
                      ? 'Selesai'
                      : item.phase === 'error'
                      ? 'Gagal'
                      : item.phase === 'warning'
                      ? 'Peringatan'
                      : 'Mulai';
                  const statusClass =
                    item.phase === 'completed'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : item.phase === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : item.phase === 'warning'
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-blue-600 dark:text-blue-300';
                  return (
                    <li key={item.id} className={`rounded-lg border px-2.5 py-2 ${dividerClass}`}>
                      <div className="flex items-start justify-between gap-2 text-[11px]">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {item.agentName || item.stageTitle || item.eventType}
                            <span className={`ml-1.5 font-normal ${mutedTextClass}`}>
                              · {item.stageTitle || item.eventType}
                            </span>
                          </p>
                          <p className={`mt-0.5 break-words ${mutedTextClass}`}>{item.title}</p>
                        </div>
                        <span className={`shrink-0 font-semibold ${statusClass}`}>{statusLabel}</span>
                      </div>
                      <div className={`mt-1 flex flex-wrap items-center gap-x-2 text-[10px] ${mutedTextClass}`}>
                        <time>{item.createdAt ? new Date(item.createdAt).toLocaleString('id-ID') : 'Waktu tidak tersedia'}</time>
                        <span>{item.channelName}</span>
                        {item.provider && <span>{item.provider}{item.model ? ` · ${item.model}` : ''}</span>}
                      </div>
                      {(item.error || item.detail || item.input || item.output) && (
                        <details className="mt-1.5 text-[10.5px]">
                          <summary className="cursor-pointer font-medium text-sky-700 dark:text-sky-300">
                            Lihat detail pekerjaan / hasil / kesalahan
                          </summary>
                          {item.input && (
                            <div className="mt-1">
                              <strong>Input / Instruksi</strong>
                              <p className="mt-0.5 whitespace-pre-wrap break-words">{item.input}</p>
                            </div>
                          )}
                          {item.output && (
                            <div className="mt-1">
                              <strong>Hasil AI</strong>
                              <p className="mt-0.5 whitespace-pre-wrap break-words">{item.output}</p>
                            </div>
                          )}
                          {item.error && (
                            <div className="mt-1 text-red-600 dark:text-red-400">
                              <strong>Kesalahan</strong>
                              <p className="mt-0.5 whitespace-pre-wrap break-words">{item.error}</p>
                            </div>
                          )}
                          {item.detail && (
                            <div className="mt-1">
                              <strong>Catatan tahap</strong>
                              <p className="mt-0.5 whitespace-pre-wrap break-words">{item.detail}</p>
                            </div>
                          )}
                          <p className={`mt-1 ${mutedTextClass}`}>
                            Project: {item.projectId || '-'} · Run: {item.runId || '-'} · Task: {item.taskId || '-'}
                          </p>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
