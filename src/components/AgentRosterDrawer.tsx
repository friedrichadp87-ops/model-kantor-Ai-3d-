import { useId, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BookMarked,
  BookOpen,
  BriefcaseBusiness,
  Clapperboard,
  Film,
  Heart,
  HeartHandshake,
  Image as ImageIcon,
  Loader2,
  Mic,
  PenTool,
  Radar,
  Scissors,
  Search,
  Send,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  AGENT_GROUP_LABELS,
  SPECIALIST_AGENTS,
  filterSpecialists,
  getSpecialistById,
  getSpecialistLiveStatus,
  type AgentGroupFilter,
  type SpecialistAgentId,
  type SpecialistAgentProfile,
} from '../office/agentRoster';
import { ZONE_LABELS } from '../office/layout';
import { validateTaskPrompt } from '../office/simulation';
import type {
  AgentId,
  LightingPreset,
  OfficeSimulationState,
  TaskEntry,
} from '../office/types';
import type { WorkspaceDivisionId } from '../office/workspaceDivisions';

interface AgentRosterDrawerProps {
  simState: OfficeSimulationState;
  lighting: LightingPreset;
  selectedSpecialistId: SpecialistAgentId | null;
  tasksByAgent: Record<AgentId, TaskEntry[]>;
  onSelectSpecialist: (specialist: SpecialistAgentProfile | null) => void;
  onSubmitSpecialistTask: (specialist: SpecialistAgentProfile, prompt: string) => void;
  onOpenDivision: (divisionId: WorkspaceDivisionId) => void;
  onClose: () => void;
}

const SPECIALIST_ICONS: Record<SpecialistAgentId, typeof BriefcaseBusiness> = {
  ceo: BriefcaseBusiness,
  'trend-researcher': Radar,
  'bible-researcher': BookMarked,
  scriptwriter: PenTool,
  'theological-guardian': BookOpen,
  'pastoral-checker': Heart,
  'storyboard-artist': Clapperboard,
  'visual-curator': ImageIcon,
  'video-composer': Film,
  'voice-artist': Mic,
  'video-editor': Scissors,
  'seo-publisher': TrendingUp,
  'community-prayer': HeartHandshake,
};

const GROUP_ORDER: AgentGroupFilter[] = [
  'all',
  'pimpinan-riset',
  'penjaga-pastoral',
  'visual-video',
  'publikasi-doa',
];

export function AgentRosterDrawer({
  simState,
  selectedSpecialistId,
  tasksByAgent,
  onSelectSpecialist,
  onSubmitSpecialistTask,
  onOpenDivision,
  onClose,
}: AgentRosterDrawerProps) {
  const [groupFilter, setGroupFilter] = useState<AgentGroupFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [prompt, setPrompt] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const searchId = useId();
  const taskInputId = useId();

  const filteredAgents = useMemo(
    () => filterSpecialists(SPECIALIST_AGENTS, groupFilter, searchQuery),
    [groupFilter, searchQuery]
  );

  const selectedSpecialist = selectedSpecialistId
    ? getSpecialistById(selectedSpecialistId) ?? null
    : null;

  const selectedTasks = useMemo(() => {
    if (!selectedSpecialist) return [];
    return (tasksByAgent[selectedSpecialist.id] ?? []).slice(0, 2);
  }, [selectedSpecialist, tasksByAgent]);

  const isSelectedRunning =
    selectedSpecialist !== null &&
    Boolean(simState.agents[selectedSpecialist.id]?.activeTaskId);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSpecialist) return;
    const check = validateTaskPrompt(prompt);
    if (!check.valid) {
      setValidationError(check.error ?? 'Instruksi tugas tidak valid.');
      return;
    }
    setValidationError(null);
    onSubmitSpecialistTask(selectedSpecialist, check.trimmed);
    setPrompt('');
  };

  return (
    <section
      aria-label="Direktori 13 Agen AI Kantor 3D"
      className="pointer-events-auto mb-2 w-full rounded-xl border border-slate-700/80 bg-[#0a1322]/97 text-slate-100 shadow-2xl"
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/90 px-3.5 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold tracking-tight text-white">
            Tim 13 Agen AI · Nama, Jabatan &amp; Pembagian Tugas
          </h2>
          <p className="truncate text-[11px] text-slate-400">
            Pilih agen untuk melihat jabatan, tanggung jawab divisi, dan memberi tugas langsung
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <label htmlFor={searchId} className="sr-only">
              Cari nama atau jabatan agen AI
            </label>
            <input
              id={searchId}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama / jabatan..."
              className="w-40 rounded-lg border border-slate-700/80 bg-[#0e1a2e] py-1 pr-2.5 pl-8 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none sm:w-48"
            />
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup direktori agen AI"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Division Group Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 bg-[#08101c] px-3.5 py-2">
        <div
          className="flex flex-wrap items-center gap-1"
          role="group"
          aria-label="Filter kelompok divisi agen AI"
        >
          {GROUP_ORDER.map((groupId) => {
            const active = groupFilter === groupId;
            return (
              <button
                key={groupId}
                type="button"
                onClick={() => setGroupFilter(groupId)}
                aria-pressed={active}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  active
                    ? 'bg-[#192942] text-white font-semibold'
                    : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
                }`}
              >
                {AGENT_GROUP_LABELS[groupId]}
              </button>
            );
          })}
        </div>

        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
          Menampilkan {filteredAgents.length} / {SPECIALIST_AGENTS.length} agen
        </span>
      </div>

      {/* Scrollable Body: 2-Column Roster Grid + Selected Specialist Inspector */}
      <div className="max-h-[370px] overflow-y-auto p-3.5">
        {/* Selected Specialist Detail & Task Assignment Panel */}
        {selectedSpecialist && (
          <div className="mb-3 rounded-xl border border-sky-500/35 bg-[#0f1d33] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-xs"
                    style={{ backgroundColor: selectedSpecialist.accentHex }}
                    aria-hidden="true"
                  />
                  <h3 className="text-sm font-bold text-white">
                    {selectedSpecialist.personName}
                  </h3>
                  <span className="text-xs font-semibold text-sky-300">
                    {selectedSpecialist.roleTitle}
                  </span>
                  <span className="text-xs text-slate-400">
                    · {selectedSpecialist.jobTitleId}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-300">
                  <span>Divisi: {selectedSpecialist.divisionLabel}</span>
                  <span className="mx-1.5 text-slate-500" aria-hidden="true">
                    ·
                  </span>
                  <span>Ruang 3D: {ZONE_LABELS[selectedSpecialist.officeZone]}</span>
                  <span className="mx-1.5 text-slate-500" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    Status 3D: {simState.agents[selectedSpecialist.id]?.statusLabel ?? 'Siap'}
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {selectedSpecialist.divisionId !== 'dashboard' && (
                  <button
                    type="button"
                    onClick={() => onOpenDivision(selectedSpecialist.divisionId)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-600/80 bg-[#162742] px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-sky-200 transition-colors hover:bg-[#1e3557] hover:text-white"
                  >
                    Buka Divisi {selectedSpecialist.divisionLabel}
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSelectSpecialist(null)}
                  aria-label="Tutup detail agen terpilih"
                  className="rounded-lg px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  Tutup Detail
                </button>
              </div>
            </div>

            {/* Responsibilities List */}
            <ul className="mt-2 grid grid-cols-1 gap-1 text-[11px] leading-relaxed text-slate-300 sm:grid-cols-3 sm:gap-2.5">
              {selectedSpecialist.responsibilities.map((item, idx) => (
                <li key={idx} className="border-t border-slate-700/60 pt-1.5">
                  <span className="font-mono text-[10px] text-amber-400">0{idx + 1}. </span>
                  {item}
                </li>
              ))}
            </ul>

            {/* Direct Task Assignment Form */}
            <form onSubmit={handleSubmit} className="mt-2.5" noValidate>
              <label
                htmlFor={taskInputId}
                className="block text-[11px] font-medium text-slate-300"
              >
                Beri tugas langsung ke {selectedSpecialist.personName} ({selectedSpecialist.roleTitle})
              </label>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                <input
                  id={taskInputId}
                  type="text"
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder={`Contoh: ${selectedSpecialist.samplePrompt}`}
                  disabled={isSelectedRunning}
                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-[#091220] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  disabled={isSelectedRunning}
                  onClick={() => {
                    setPrompt(selectedSpecialist.samplePrompt);
                    setValidationError(null);
                  }}
                  className="shrink-0 rounded-lg border border-slate-700 bg-[#122038] px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-50"
                >
                  Isi Contoh
                </button>
                <button
                  type="submit"
                  disabled={isSelectedRunning}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-sky-500 disabled:opacity-60"
                >
                  {isSelectedRunning ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Memproses
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                      Kirim Tugas
                    </>
                  )}
                </button>
              </div>
              {validationError && (
                <p
                  role="alert"
                  className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-rose-400"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {validationError}
                </p>
              )}
            </form>

            {/* Latest Task Responses for Selected Specialist */}
            {selectedTasks.length > 0 && (
              <div className="mt-2.5 space-y-1.5 border-t border-slate-700/70 pt-2">
                {selectedTasks.map((entry) => (
                  <div key={entry.id} className="text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-slate-200">{entry.prompt}</span>
                      <span
                        className={`shrink-0 font-mono text-[10px] ${
                          entry.status === 'error'
                            ? 'text-rose-400'
                            : entry.status === 'running'
                            ? 'text-amber-300'
                            : 'text-emerald-400'
                        }`}
                      >
                        {entry.status === 'running'
                          ? 'Berjalan'
                          : entry.status === 'error'
                          ? 'Gagal'
                          : 'Selesai'}
                      </span>
                    </div>
                    {entry.output && (
                      <div className="mt-1 whitespace-pre-wrap rounded-lg border border-slate-800 bg-[#091220] px-2.5 py-2 text-[11px] leading-relaxed text-slate-200">
                        {entry.output}
                      </div>
                    )}
                    {entry.error && (
                      <p className="mt-1 text-[11px] text-rose-400">{entry.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2-Column Agent Roster Grid matching reference layout */}
        {filteredAgents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700/80 p-6 text-center text-xs text-slate-400">
            Tidak ada agen AI yang cocok dengan pencarian &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {filteredAgents.map((agent) => {
              const Icon = SPECIALIST_ICONS[agent.id];
              const isSelected = selectedSpecialistId === agent.id;
              const status = getSpecialistLiveStatus(agent, simState);

              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    onSelectSpecialist(isSelected ? null : agent);
                    setValidationError(null);
                  }}
                  aria-pressed={isSelected}
                  className={`group flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 ${
                    isSelected
                      ? 'border-sky-400/75 bg-[#13233b]'
                      : 'border-slate-700/60 bg-[#0d192b] hover:border-slate-500/80 hover:bg-[#112036]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {/* Square dark-navy icon badge matching reference */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700/70 bg-[#15243b]">
                      <Icon
                        className="h-5 w-5"
                        style={{ color: agent.accentHex }}
                        aria-hidden="true"
                      />
                    </div>

                    {/* Personal Name + Role + Exact Task Summary + Division Metadata */}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className="truncate text-[13px] font-bold text-white">
                          {agent.personName}
                        </span>
                        <span className="text-[11px] text-slate-500" aria-hidden="true">
                          ·
                        </span>
                        <span className="truncate text-[12px] font-semibold text-sky-300">
                          {agent.roleTitle}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11.5px] text-slate-300">
                        {agent.summary}
                      </p>
                      <p className="mt-0.5 truncate text-[10.5px] text-slate-400">
                        {agent.jobTitleId} · {agent.divisionLabel}
                      </p>
                    </div>
                  </div>

                  {/* Right Status Label ("Siap" amber matching reference, or "Bekerja"/"Aktif" emerald) */}
                  <span
                    className={`shrink-0 text-xs font-semibold whitespace-nowrap ${
                      status.code === 'working' ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {status.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
