import {
  Briefcase,
  Building2,
  Clapperboard,
  ClipboardList,
  Coffee,
  FastForward,
  Moon,
  Pause,
  Play,
  Sun,
  Sunset,
  Tv,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import {
  BUILDING_FLOORS,
  FLOOR_ORDER,
  getFloorEmployeeIdentity,
  type BuildingSimulationState,
  type FloorId,
  type FloorViewMode,
} from '../office/buildingFloors';
import {
  AGENT_ORDER,
  AGENT_PROFILES,
  CAMERA_PRESETS,
  CAMERA_PRESET_ORDER,
} from '../office/layout';
import type {
  AgentId,
  LightingPreset,
  OfficeCommand,
  OfficeZoneId,
} from '../office/types';

interface OfficeControlsDrawerProps {
  buildingState: BuildingSimulationState;
  floorView: FloorViewMode;
  activeFloorId: FloorId;
  activeZone: OfficeZoneId;
  lighting: LightingPreset;
  simSpeed: number;
  selectedTarget: { floorId: FloorId; agentId: AgentId } | null;
  onSelectFloorView: (view: FloorViewMode) => void;
  onSelectZone: (zone: OfficeZoneId) => void;
  onSelectLighting: (preset: LightingPreset) => void;
  onSelectSpeed: (speed: number) => void;
  onSelectAgent: (floorId: FloorId, agentId: AgentId | null) => void;
  onRunCommand: (command: OfficeCommand) => void;
  onOpenFloorDashboard: () => void;
  onOpenMediaStudio: () => void;
  onOpenOrchestrator: () => void;
  onOpenShortsFactory: () => void;
  onClose: () => void;
}

export function OfficeControlsDrawer({
  buildingState,
  floorView,
  activeFloorId,
  activeZone,
  lighting,
  simSpeed,
  selectedTarget,
  onSelectFloorView,
  onSelectZone,
  onSelectLighting,
  onSelectSpeed,
  onSelectAgent,
  onRunCommand,
  onOpenFloorDashboard,
  onOpenMediaStudio,
  onOpenOrchestrator,
  onOpenShortsFactory,
  onClose,
}: OfficeControlsDrawerProps) {
  const isDark = lighting === 'malam';
  const activeFloorSim = buildingState.floors[activeFloorId];
  const activeFloorCfg = BUILDING_FLOORS[activeFloorId];

  const surfaceClass = isDark
    ? 'border-slate-700/90 bg-[#0b1322]/97 text-slate-100'
    : 'border-slate-200/95 bg-[#fcfbf8]/97 text-slate-900';

  const dividerClass = isDark ? 'border-slate-800' : 'border-slate-200/90';
  const mutedTextClass = isDark ? 'text-slate-400' : 'text-slate-600';
  const segBgClass = isDark ? 'bg-slate-800/90' : 'bg-slate-200/75';
  const segActiveClass = isDark
    ? 'bg-slate-100 text-slate-950 font-semibold'
    : 'bg-white text-slate-950 font-semibold shadow-xs';
  const segIdleClass = isDark
    ? 'text-slate-300 hover:text-white'
    : 'text-slate-600 hover:text-slate-950';

  return (
    <section
      aria-label="Menu Kontrol Kantor AI 3D"
      data-testid="office-controls-drawer"
      className={`pointer-events-auto w-full rounded-xl border shadow-2xl transition-colors duration-200 ${surfaceClass}`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between gap-3 border-b px-4 py-2.5 ${dividerClass}`}>
        <div className="min-w-0">
          <h2 className="text-sm font-bold tracking-tight">Kontrol Tampilan &amp; Simulasi 3D</h2>
          <p className={`text-[11px] ${mutedTextClass}`}>
            Atur lantai cutaway, sudut kamera, pencahayaan, kecepatan simulasi, dan perintah tim tanpa menghalangi layar 3D
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup menu kontrol 3D"
          className={`rounded-lg p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
            isDark
              ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
              : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Body Grid */}
      <div className="space-y-3.5 px-4 py-3.5">
        {/* Row 1: Floor View + Camera Presets */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className={`mb-1.5 text-[11px] font-semibold ${mutedTextClass}`}>
              Tampilan Lantai Menara
            </p>
            <div
              className={`flex flex-wrap items-center gap-1 rounded-lg p-1 ${segBgClass}`}
              role="group"
              aria-label="Pilih lantai Menara Kantor AI 3D"
            >
              <button
                type="button"
                data-testid="floor-btn-all"
                onClick={() => onSelectFloorView('all')}
                aria-pressed={floorView === 'all'}
                className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors ${
                  floorView === 'all' ? segActiveClass : segIdleClass
                }`}
              >
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>3 Lantai</span>
              </button>
              {FLOOR_ORDER.map((fid) => {
                const cfg = BUILDING_FLOORS[fid];
                const active = floorView === fid;
                return (
                  <button
                    key={fid}
                    type="button"
                    data-testid={`floor-btn-${fid}`}
                    title={`${cfg.label} — ${cfg.channelName} (${cfg.geminiEnvVar})`}
                    onClick={() => onSelectFloorView(fid)}
                    aria-pressed={active}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors ${
                      active ? segActiveClass : segIdleClass
                    }`}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-xs"
                      style={{ backgroundColor: cfg.accentHex }}
                      aria-hidden="true"
                    />
                    <span>{cfg.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-7">
            <p className={`mb-1.5 text-[11px] font-semibold ${mutedTextClass}`}>
              Sudut Kamera Ruangan
            </p>
            <div
              className={`flex flex-wrap items-center gap-1 rounded-lg p-1 ${segBgClass}`}
              role="group"
              aria-label="Sudut kamera ruangan"
            >
              {CAMERA_PRESET_ORDER.map((zoneId) => {
                const preset = CAMERA_PRESETS[zoneId];
                const active = activeZone === zoneId && !selectedTarget;
                return (
                  <button
                    key={zoneId}
                    type="button"
                    onClick={() => onSelectZone(zoneId)}
                    aria-pressed={active}
                    className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors ${
                      active ? segActiveClass : segIdleClass
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 2: Lighting, Speed, Routine Commands, Studio Shortcuts */}
        <div className={`grid grid-cols-1 gap-3 border-t pt-3 lg:grid-cols-12 ${dividerClass}`}>
          <div className="flex flex-wrap items-end gap-3 lg:col-span-5">
            <div>
              <p className={`mb-1.5 text-[11px] font-semibold ${mutedTextClass}`}>Pencahayaan</p>
              <div
                className={`flex items-center gap-0.5 rounded-lg p-1 ${segBgClass}`}
                role="group"
                aria-label="Pencahayaan waktu"
              >
                {(
                  [
                    { id: 'pagi', label: 'Pagi', Icon: Sun },
                    { id: 'sore', label: 'Sore', Icon: Sunset },
                    { id: 'malam', label: 'Malam', Icon: Moon },
                  ] as const
                ).map(({ id, label, Icon }) => {
                  const active = lighting === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectLighting(id)}
                      aria-pressed={active}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors ${
                        active ? segActiveClass : segIdleClass
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className={`mb-1.5 text-[11px] font-semibold ${mutedTextClass}`}>Kecepatan</p>
              <div
                className={`flex items-center gap-0.5 rounded-lg p-1 ${segBgClass}`}
                role="group"
                aria-label="Kecepatan simulasi"
              >
                {[
                  { value: 0, label: 'Jeda simulasi', text: 'Jeda', Icon: Pause },
                  { value: 1, label: 'Kecepatan normal 1x', text: '1x', Icon: Play },
                  { value: 2, label: 'Kecepatan cepat 2x', text: '2x', Icon: FastForward },
                ].map(({ value, label, text, Icon }) => {
                  const active = simSpeed === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onSelectSpeed(value)}
                      aria-label={label}
                      aria-pressed={active}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 font-mono text-xs whitespace-nowrap tabular-nums transition-colors ${
                        active ? segActiveClass : segIdleClass
                      }`}
                    >
                      <Icon className="h-3 w-3" aria-hidden="true" />
                      <span>{text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <p className={`mb-1.5 text-[11px] font-semibold ${mutedTextClass}`}>
              Aksi Rutin Tim &amp; Pintasan Modul
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onRunCommand('standup')}
                aria-pressed={activeFloorSim.officeMode === 'rapat'}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeFloorSim.officeMode === 'rapat'
                    ? isDark
                      ? 'border-blue-400 bg-blue-600 text-white'
                      : 'border-slate-900 bg-slate-900 text-white'
                    : isDark
                    ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Rapat Tim</span>
              </button>

              <button
                type="button"
                onClick={() => onRunCommand('coffee_break')}
                aria-pressed={activeFloorSim.officeMode === 'istirahat'}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeFloorSim.officeMode === 'istirahat'
                    ? isDark
                      ? 'border-amber-400 bg-amber-600 text-white'
                      : 'border-slate-900 bg-slate-900 text-white'
                    : isDark
                    ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Coffee className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Rehat Kopi</span>
              </button>

              <button
                type="button"
                onClick={() => onRunCommand('back_to_work')}
                aria-pressed={activeFloorSim.officeMode === 'kerja'}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeFloorSim.officeMode === 'kerja'
                    ? isDark
                      ? 'border-emerald-400 bg-emerald-600 text-white'
                      : 'border-slate-900 bg-slate-900 text-white'
                    : isDark
                    ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Meja Kerja</span>
              </button>

              <button
                type="button"
                onClick={onOpenFloorDashboard}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  isDark
                    ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Performa Lantai</span>
              </button>

              <button
                type="button"
                onClick={onOpenMediaStudio}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  isDark
                    ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Studio Media</span>
              </button>

              <button
                type="button"
                onClick={onOpenOrchestrator}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  isDark
                    ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Workflow className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Orkestrator</span>
              </button>

              <button
                type="button"
                onClick={onOpenShortsFactory}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  isDark
                    ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Tv className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Pabrik Shorts</span>
              </button>
            </div>
          </div>
        </div>

        {/* Row 3: Quick Focus 13 Employees on Active Floor */}
        <div className={`border-t pt-3 ${dividerClass}`}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className={`text-[11px] font-semibold ${mutedTextClass}`}>
              Fokus Kamera ke Karyawan {activeFloorCfg.label} · {activeFloorCfg.channelName}
            </p>
            <span className={`font-mono text-[11px] ${mutedTextClass}`}>
              {activeFloorCfg.geminiEnvVar}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {AGENT_ORDER.map((id) => {
              const agent = activeFloorSim.agents[id];
              const profile = AGENT_PROFILES[id];
              const floorPerson = getFloorEmployeeIdentity(activeFloorId, id);
              const active =
                selectedTarget?.floorId === activeFloorId && selectedTarget?.agentId === id;
              const busy = Boolean(agent.activeTaskId);
              return (
                <button
                  key={`${activeFloorId}-${id}`}
                  type="button"
                  title={`${floorPerson.name} — ${profile.role}`}
                  onClick={() => onSelectAgent(activeFloorId, active ? null : id)}
                  aria-pressed={active}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs whitespace-nowrap transition-colors ${
                    active
                      ? isDark
                        ? 'border-slate-300 bg-slate-100 text-slate-950 font-semibold'
                        : 'border-slate-900 bg-slate-900 text-white font-semibold'
                      : isDark
                      ? 'border-slate-700/80 bg-slate-900/70 text-slate-200 hover:border-slate-500'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-400'
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-xs"
                    style={{ backgroundColor: activeFloorCfg.accentHex }}
                    aria-hidden="true"
                  />
                  <span>{floorPerson.shortName}</span>
                  {busy && <span className="font-mono text-[10px] opacity-80">· Tugas</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
