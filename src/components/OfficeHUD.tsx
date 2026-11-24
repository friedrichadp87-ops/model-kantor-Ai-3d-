import {
  ChevronDown,
  ChevronUp,
  Sun,
  Sunset,
  Moon,
  Users,
  Coffee,
  Briefcase,
  Pause,
  Play,
  FastForward,
  Clapperboard,
  Tv,
} from 'lucide-react';
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
  OfficeSimulationState,
  OfficeZoneId,
  TaskEntry,
} from '../office/types';
import type { ActivityLogEntry } from '../office/activityLog';
import type { GeneratedMediaItem } from '../office/mediaStudio';
import type {
  ChannelTemplateConfig,
  ChannelTemplatesMap,
  QueueStage,
  ShortsChannelId,
  ShortsDuration,
  ShortsQueueItem,
} from '../office/shortsFactory';
import {
  getDivisionById,
  type PublicationSlot,
  type WorkspaceDivisionId,
} from '../office/workspaceDivisions';
import type {
  SpecialistAgentId,
  SpecialistAgentProfile,
} from '../office/agentRoster';
import type { ProviderConfig } from '../office/providerConfig';
import { ActivityLogPanel } from './ActivityLogPanel';
import { AgentRosterDrawer } from './AgentRosterDrawer';
import { AgentTaskDrawer } from './AgentTaskDrawer';
import { DivisionToolsDrawer, type DivisionToolMode } from './DivisionToolsDrawer';
import { MediaStudioDrawer, type MediaStudioPrefill } from './MediaStudioDrawer';
import { ProviderSettingsDrawer } from './ProviderSettingsDrawer';
import {
  ShortsFactoryDrawer,
  type FactoryTab,
  type ShortsBriefPrefill,
  type ShortsProductionEvent,
} from './ShortsFactoryDrawer';
import { UtilizationDashboard } from './UtilizationDashboard';
import { WorkspaceSidebar } from './WorkspaceSidebar';

interface OfficeHUDProps {
  simState: OfficeSimulationState;
  activityLog: ActivityLogEntry[];
  activeZone: OfficeZoneId;
  activeDivision: WorkspaceDivisionId;
  sidebarCollapsed: boolean;
  lighting: LightingPreset;
  simSpeed: number;
  selectedAgentId: AgentId | null;
  dockCollapsed: boolean;
  tasksByAgent: Record<AgentId, TaskEntry[]>;
  mediaStudioOpen: boolean;
  mediaStudioPrefill: MediaStudioPrefill | null;
  mediaItems: GeneratedMediaItem[];
  projectedVideoId: string | null;
  mountedImageUrl: string | null;
  shortsFactoryOpen: boolean;
  shortsFactoryTab: FactoryTab;
  shortsFactoryTabNonce: number;
  shortsBriefPrefill: ShortsBriefPrefill | null;
  shortsQueue: ShortsQueueItem[];
  channelTemplates: ChannelTemplatesMap;
  divisionToolMode: DivisionToolMode | null;
  weeklySchedule: PublicationSlot[];
  agentRosterOpen: boolean;
  providerSettingsOpen: boolean;
  providerConfig: ProviderConfig;
  selectedSpecialistId: SpecialistAgentId | null;
  onSelectZone: (zone: OfficeZoneId) => void;
  onSelectDivision: (divisionId: WorkspaceDivisionId) => void;
  onToggleSidebar: () => void;
  onSelectLighting: (preset: LightingPreset) => void;
  onSelectSpeed: (speed: number) => void;
  onSelectAgent: (agentId: AgentId | null) => void;
  onOpenAgentRoster: () => void;
  onCloseAgentRoster: () => void;
  onCloseProviderSettings: () => void;
  onSaveProviderConfig: (next: ProviderConfig) => void;
  onResetProviderConfig: () => void;
  onOpenChannelTemplates: () => void;
  onVoiceSynthesisEvent: (phase: 'start' | 'done' | 'error', label: string) => void;
  onSelectSpecialist: (specialist: SpecialistAgentProfile | null) => void;
  onSubmitSpecialistTask: (specialist: SpecialistAgentProfile, prompt: string) => void;
  onRunCommand: (command: OfficeCommand) => void;
  onToggleDock: () => void;
  onToggleMediaStudio: () => void;
  onToggleShortsFactory: () => void;
  onCloseDivisionTool: () => void;
  onMediaCreated: (item: GeneratedMediaItem) => void;
  onProjectVideo: (item: GeneratedMediaItem | null) => void;
  onMountGalleryImage: (dataUrl: string | null, label?: string) => void;
  onSubmitAgentTask: (agentId: AgentId, prompt: string) => void;
  onUpsertShortsQueueItem: (item: ShortsQueueItem) => void;
  onUpdateShortsQueueStage: (id: string, stage: QueueStage) => void;
  onSaveChannelTemplate: (template: ChannelTemplateConfig) => void;
  onResetChannelTemplate: (channelId: ShortsChannelId) => void;
  onUpdateScheduleSlot: (
    slotId: string,
    patch: Partial<Pick<PublicationSlot, 'channelId' | 'queueItemId'>>
  ) => void;
  onSendClipToProduction: (payload: {
    channelId: ShortsChannelId;
    title: string;
    bibleReference: string;
    durationSeconds: ShortsDuration;
    notes: string;
  }) => void;
  onShortsProductionEvent: (ev: ShortsProductionEvent) => void;
  onHandoffToMediaStudio: (payload: {
    tab: 'video' | 'image';
    prompt: string;
    aspect: '9:16';
  }) => void;
}

const LIGHTING_LABELS: Record<LightingPreset, string> = {
  pagi: 'Pagi',
  sore: 'Sore',
  malam: 'Malam',
};

const MODE_LABELS: Record<OfficeSimulationState['officeMode'], string> = {
  kerja: 'Mode Kerja',
  rapat: 'Rapat Tim',
  istirahat: 'Rehat Kopi',
};

export function OfficeHUD({
  simState,
  activityLog,
  activeZone,
  activeDivision,
  sidebarCollapsed,
  lighting,
  simSpeed,
  selectedAgentId,
  dockCollapsed,
  tasksByAgent,
  mediaStudioOpen,
  mediaStudioPrefill,
  mediaItems,
  projectedVideoId,
  mountedImageUrl,
  shortsFactoryOpen,
  shortsFactoryTab,
  shortsFactoryTabNonce,
  shortsBriefPrefill,
  shortsQueue,
  channelTemplates,
  divisionToolMode,
  weeklySchedule,
  agentRosterOpen,
  providerSettingsOpen,
  providerConfig,
  selectedSpecialistId,
  onSelectZone,
  onSelectDivision,
  onToggleSidebar,
  onSelectLighting,
  onSelectSpeed,
  onSelectAgent,
  onOpenAgentRoster,
  onCloseAgentRoster,
  onCloseProviderSettings,
  onSaveProviderConfig,
  onResetProviderConfig,
  onOpenChannelTemplates,
  onVoiceSynthesisEvent,
  onSelectSpecialist,
  onSubmitSpecialistTask,
  onRunCommand,
  onToggleDock,
  onToggleMediaStudio,
  onToggleShortsFactory,
  onCloseDivisionTool,
  onMediaCreated,
  onProjectVideo,
  onMountGalleryImage,
  onSubmitAgentTask,
  onUpsertShortsQueueItem,
  onUpdateShortsQueueStage,
  onSaveChannelTemplate,
  onResetChannelTemplate,
  onUpdateScheduleSlot,
  onSendClipToProduction,
  onShortsProductionEvent,
  onHandoffToMediaStudio,
}: OfficeHUDProps) {
  const isDark = lighting === 'malam';
  const selectedAgent = selectedAgentId ? simState.agents[selectedAgentId] : null;
  const divisionMeta = getDivisionById(activeDivision);

  const surfaceClass = isDark
    ? 'border-slate-700/90 bg-[#0f172a]/94 text-slate-100'
    : 'border-slate-200/95 bg-[#fcfbf8]/95 text-slate-900';

  const mutedTextClass = isDark ? 'text-slate-400' : 'text-slate-600';

  const segBgClass = isDark ? 'bg-slate-800/90' : 'bg-slate-200/75';
  const segActiveClass = isDark
    ? 'bg-slate-100 text-slate-950 font-semibold'
    : 'bg-white text-slate-950 font-semibold shadow-xs';
  const segIdleClass = isDark
    ? 'text-slate-300 hover:text-white'
    : 'text-slate-600 hover:text-slate-950';

  return (
    <>
      <WorkspaceSidebar
        activeDivision={activeDivision}
        collapsed={sidebarCollapsed}
        onSelectDivision={onSelectDivision}
        onToggleCollapse={onToggleSidebar}
      />

      <div
        className={`pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 transition-[padding] duration-200 sm:p-5 ${
          sidebarCollapsed ? 'pl-[74px] sm:pl-[78px]' : 'pl-[74px] md:pl-[246px]'
        }`}
      >
        {/* Top Architectural Header: Brand + Utilization (Left) & Activity Log (Right), Zero Center Occlusion */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-start gap-3">
            <div
              className={`pointer-events-auto rounded-xl border px-4 py-2.5 shadow-sm transition-colors duration-200 ${surfaceClass}`}
            >
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight sm:text-lg">
                  Kantor AI 3D
                </h1>
                <span
                  className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                    isDark
                      ? 'border-sky-500/40 bg-sky-950/70 text-sky-300'
                      : 'border-slate-200 bg-slate-100 text-slate-700'
                  }`}
                >
                  {divisionMeta.divisionName}
                </span>
              </div>
              <p className={`mt-0.5 text-xs tabular-nums ${mutedTextClass}`}>
                <span>13 Agen AI</span>
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                <span>{MODE_LABELS[simState.officeMode]}</span>
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                <span>{LIGHTING_LABELS[lighting]}</span>
                {simState.completedTaskCount > 0 && (
                  <>
                    <span className="mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    <span>{simState.completedTaskCount} Tugas Selesai</span>
                  </>
                )}
              </p>
            </div>

            <UtilizationDashboard
              simState={simState}
              lighting={lighting}
              selectedAgentId={selectedAgentId}
              onSelectAgent={(id) => onSelectAgent(id)}
            />
          </div>

          <ActivityLogPanel
            entries={activityLog}
            lighting={lighting}
            selectedAgentId={selectedAgentId}
            onSelectAgent={(id) => onSelectAgent(id)}
          />
        </header>

        {/* Collapsible Unified Bottom Control Dock */}
        <div className="mx-auto flex w-full max-w-[min(1040px,100%)] flex-col items-center">
          {/* Mutually Exclusive Drawers cleanly above dock */}
          {!dockCollapsed && providerSettingsOpen && (
            <ProviderSettingsDrawer
              lighting={lighting}
              config={providerConfig}
              onSaveConfig={onSaveProviderConfig}
              onResetConfig={onResetProviderConfig}
              onOpenChannelTemplates={onOpenChannelTemplates}
              onVoiceSynthesisEvent={onVoiceSynthesisEvent}
              onClose={onCloseProviderSettings}
            />
          )}

          {!dockCollapsed && !providerSettingsOpen && agentRosterOpen && (
            <AgentRosterDrawer
              simState={simState}
              lighting={lighting}
              selectedSpecialistId={selectedSpecialistId}
              tasksByAgent={tasksByAgent}
              onSelectSpecialist={onSelectSpecialist}
              onSubmitSpecialistTask={onSubmitSpecialistTask}
              onOpenDivision={onSelectDivision}
              onClose={onCloseAgentRoster}
            />
          )}

          {!dockCollapsed && !providerSettingsOpen && !agentRosterOpen && divisionToolMode && (
            <DivisionToolsDrawer
              mode={divisionToolMode}
              lighting={lighting}
              queue={shortsQueue}
              schedule={weeklySchedule}
              simState={simState}
              mediaItems={mediaItems}
              onClose={onCloseDivisionTool}
              onUpdateScheduleSlot={onUpdateScheduleSlot}
              onSendClipToProduction={onSendClipToProduction}
            />
          )}

          {!dockCollapsed &&
            !providerSettingsOpen &&
            !agentRosterOpen &&
            !divisionToolMode &&
            shortsFactoryOpen && (
              <ShortsFactoryDrawer
                lighting={lighting}
                queue={shortsQueue}
                channelTemplates={channelTemplates}
                externalTab={shortsFactoryTab}
                externalTabNonce={shortsFactoryTabNonce}
                prefillBrief={shortsBriefPrefill}
                onClose={onToggleShortsFactory}
                onUpsertQueueItem={onUpsertShortsQueueItem}
                onUpdateQueueStage={onUpdateShortsQueueStage}
                onSaveChannelTemplate={onSaveChannelTemplate}
                onResetChannelTemplate={onResetChannelTemplate}
                onProductionEvent={onShortsProductionEvent}
                onHandoffToMediaStudio={onHandoffToMediaStudio}
              />
            )}

          {!dockCollapsed &&
            !providerSettingsOpen &&
            !agentRosterOpen &&
            !divisionToolMode &&
            !shortsFactoryOpen &&
            mediaStudioOpen && (
              <MediaStudioDrawer
                lighting={lighting}
                items={mediaItems}
                projectedVideoId={projectedVideoId}
                mountedImageUrl={mountedImageUrl}
                prefill={mediaStudioPrefill}
                onClose={onToggleMediaStudio}
                onMediaCreated={onMediaCreated}
                onProjectVideo={onProjectVideo}
                onMountGalleryImage={onMountGalleryImage}
              />
            )}

          {!dockCollapsed &&
            !providerSettingsOpen &&
            !agentRosterOpen &&
            !divisionToolMode &&
            !shortsFactoryOpen &&
            !mediaStudioOpen &&
            selectedAgent && (
              <AgentTaskDrawer
                agent={selectedAgent}
                tasks={tasksByAgent[selectedAgent.id] ?? []}
                lighting={lighting}
                onClose={() => onSelectAgent(null)}
                onOpenAgentRoster={onOpenAgentRoster}
                onSubmitTask={(prompt) => onSubmitAgentTask(selectedAgent.id, prompt)}
              />
            )}

        {/* Collapse / Expand Handle */}
        <button
          type="button"
          onClick={onToggleDock}
          aria-expanded={!dockCollapsed}
          aria-label={dockCollapsed ? 'Tampilkan Kontrol' : 'Sembunyikan Kontrol'}
          className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${surfaceClass} ${
            dockCollapsed ? 'rounded-b-lg border-b shadow-md' : ''
          }`}
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              Tampilkan Kontrol
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              Sembunyikan Kontrol
            </>
          )}
        </button>

        {/* Main Horizontal Control Dock */}
        {!dockCollapsed && (
          <nav
            aria-label="Kontrol Kantor AI 3D"
            className={`pointer-events-auto w-full rounded-xl border px-2.5 py-2 shadow-lg transition-colors duration-200 sm:px-3.5 sm:py-3 ${surfaceClass}`}
          >
            {/* Row 1: Camera Presets + Lighting & Speed */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Camera Zone Tabs */}
              <div
                className={`flex max-w-full items-center gap-1 overflow-x-auto rounded-lg p-0.5 sm:p-1 ${segBgClass}`}
                role="group"
                aria-label="Sudut kamera ruangan"
              >
                {CAMERA_PRESET_ORDER.map((zoneId) => {
                  const preset = CAMERA_PRESETS[zoneId];
                  const active = activeZone === zoneId && !selectedAgentId;
                  return (
                    <button
                      key={zoneId}
                      type="button"
                      onClick={() => onSelectZone(zoneId)}
                      aria-pressed={active}
                      className={`shrink-0 rounded-md px-2 py-1 text-xs whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 sm:px-2.5 sm:py-1.5 ${
                        active ? segActiveClass : segIdleClass
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {/* Right Utilities: Lighting + Speed */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div
                  className={`flex items-center gap-0.5 rounded-lg p-0.5 sm:p-1 ${segBgClass}`}
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
                        aria-label={label}
                        aria-pressed={active}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 sm:py-1.5 ${
                          active ? segActiveClass : segIdleClass
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">{label}</span>
                      </button>
                    );
                  })}
                </div>

                <div
                  className={`flex items-center gap-0.5 rounded-lg p-0.5 sm:p-1 ${segBgClass}`}
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
                        className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-mono text-xs whitespace-nowrap tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 sm:py-1.5 ${
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

            {/* Subtle Hairline Divider */}
            <div
              className={`my-2 h-px w-full sm:my-2.5 ${
                isDark ? 'bg-slate-800' : 'bg-slate-200/90'
              }`}
              aria-hidden="true"
            />

            {/* Row 2: 13 AI Agents Quick-Focus + Studio Commands */}
            <div className="flex flex-wrap items-center justify-between gap-2 lg:flex-nowrap">
              {/* Scrollable 13-Agent Selector */}
              <div
                className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5"
                role="group"
                aria-label="Pilih dari 13 agen AI untuk diperiksa atau diberi tugas"
              >
                {AGENT_ORDER.map((id) => {
                  const agent = simState.agents[id];
                  const profile = AGENT_PROFILES[id];
                  const active = selectedAgentId === id;
                  const busy = Boolean(agent.activeTaskId);
                  return (
                    <button
                      key={id}
                      type="button"
                      title={`${profile.name} — ${profile.role}`}
                      onClick={() => onSelectAgent(active ? null : id)}
                      aria-pressed={active}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                        active
                          ? isDark
                            ? 'border-slate-300 bg-slate-800 text-white font-semibold'
                            : 'border-slate-900 bg-slate-900 text-white font-semibold'
                          : isDark
                          ? 'border-slate-700/80 bg-slate-900/70 text-slate-200 hover:border-slate-500'
                          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-400'
                      }`}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-xs"
                        style={{ backgroundColor: agent.accentHex }}
                        aria-hidden="true"
                      />
                      <span>{profile.shortName}</span>
                      {busy && (
                        <span className="font-mono text-[10px] opacity-80">
                          · Tugas
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Office-Wide Routine Commands */}
              <div
                className="flex shrink-0 items-center gap-1.5"
                role="group"
                aria-label="Aksi tim kantor"
              >
                <button
                  type="button"
                  onClick={() => onRunCommand('standup')}
                  aria-pressed={simState.officeMode === 'rapat'}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    simState.officeMode === 'rapat'
                      ? isDark
                        ? 'border-blue-400 bg-blue-600 text-white'
                        : 'border-slate-900 bg-slate-900 text-white'
                      : isDark
                      ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  Rapat Tim
                </button>

                <button
                  type="button"
                  onClick={() => onRunCommand('coffee_break')}
                  aria-pressed={simState.officeMode === 'istirahat'}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    simState.officeMode === 'istirahat'
                      ? isDark
                        ? 'border-amber-400 bg-amber-600 text-white'
                        : 'border-slate-900 bg-slate-900 text-white'
                      : isDark
                      ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Coffee className="h-3.5 w-3.5" aria-hidden="true" />
                  Rehat Kopi
                </button>

                <button
                  type="button"
                  onClick={() => onRunCommand('back_to_work')}
                  aria-pressed={simState.officeMode === 'kerja'}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    simState.officeMode === 'kerja'
                      ? isDark
                        ? 'border-emerald-400 bg-emerald-600 text-white'
                        : 'border-slate-900 bg-slate-900 text-white'
                      : isDark
                      ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                  Meja Kerja
                </button>

                <button
                  type="button"
                  onClick={onToggleMediaStudio}
                  aria-pressed={mediaStudioOpen}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    mediaStudioOpen
                      ? isDark
                        ? 'border-violet-400 bg-violet-600 text-white'
                        : 'border-slate-900 bg-slate-900 text-white'
                      : isDark
                      ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" />
                  Studio Media
                </button>

                <button
                  type="button"
                  onClick={onToggleShortsFactory}
                  aria-pressed={shortsFactoryOpen}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    shortsFactoryOpen
                      ? isDark
                        ? 'border-blue-400 bg-blue-600 text-white'
                        : 'border-slate-900 bg-slate-900 text-white'
                      : isDark
                      ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Tv className="h-3.5 w-3.5" aria-hidden="true" />
                  Pabrik Shorts
                </button>
              </div>
            </div>
          </nav>
        )}
        </div>
      </div>
    </>
  );
}
