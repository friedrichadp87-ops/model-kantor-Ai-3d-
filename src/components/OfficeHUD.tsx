import { useMemo, useState } from 'react';
import {
  BUILDING_FLOORS,
  TOTAL_BUILDING_EMPLOYEES,
  computeBuildingUtilization,
  makeFloorAgentKey,
  type BuildingSimulationState,
  type FloorId,
  type FloorViewMode,
} from '../office/buildingFloors';
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
  LocalBibleDatabase,
  QueueStage,
  ShortsChannelId,
  ShortsDuration,
  ShortsQueueItem,
} from '../office/shortsFactory';
import type { MasterBibleSyncMode } from '../office/masterBible';
import {
  getDivisionById,
  type PublicationSlot,
  type WorkspaceDivisionId,
} from '../office/workspaceDivisions';
import type {
  SpecialistAgentId,
  SpecialistAgentProfile,
} from '../office/agentRoster';
import type { FirestoreSyncStatus } from '../firebase/client';
import type { FirebaseAuthUserSummary, WorkHistoryRecord } from '../firebase/officeSync';
import type { ProviderConfig } from '../office/providerConfig';
import { ActivityLogPanel } from './ActivityLogPanel';
import { AgentRosterDrawer } from './AgentRosterDrawer';
import { AgentTaskDrawer } from './AgentTaskDrawer';
import { DivisionToolsDrawer, type DivisionToolMode } from './DivisionToolsDrawer';
import { FirebaseAuthModal } from './FirebaseAuthModal';
import { SetupGuideModal } from './SetupGuideModal';
import { FloorDashboardDrawer } from './FloorDashboardDrawer';
import { FloorWorkflowDrawer } from './FloorWorkflowDrawer';
import { MediaStudioDrawer, type MediaStudioPrefill } from './MediaStudioDrawer';
import { OfficeControlsDrawer } from './OfficeControlsDrawer';
import {
  ProductionOrchestratorDrawer,
  type OrchestratorPrefill,
  type OrchestratorStageEvent,
} from './ProductionOrchestratorDrawer';
import { ProviderSettingsDrawer, type ProviderTab } from './ProviderSettingsDrawer';
import {
  ShortsFactoryDrawer,
  type FactoryTab,
  type ShortsBriefPrefill,
  type ShortsProductionEvent,
} from './ShortsFactoryDrawer';
import { usePWA } from '../pwa/usePWA';
import { PWAStatusToast } from './PWAInstallAndUpdate';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import type { ProviderConfig } from '../office/providerConfig';

interface OfficeHUDProps {
  buildingState: BuildingSimulationState;
  floorView: FloorViewMode;
  activeFloorId: FloorId;
  activityLog: ActivityLogEntry[];
  activeZone: OfficeZoneId;
  activeDivision: WorkspaceDivisionId;
  sidebarCollapsed: boolean;
  lighting: LightingPreset;
  simSpeed: number;
  selectedTarget: { floorId: FloorId; agentId: AgentId } | null;
  tasksByFloorAgent: Record<string, TaskEntry[]>;
  workHistory: WorkHistoryRecord[];
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
  orchestratorOpen: boolean;
  floorDashboardOpen: boolean;
  floorWorkflowFloorId: FloorId | null;
  controlsOpen: boolean;
  providerConfig: ProviderConfig;
  onNarrationAudioCreated: (dataUrl: string) => void;
  selectedSpecialistId: SpecialistAgentId | null;
  masterBible: LocalBibleDatabase | null;
  masterBibleBusy: boolean;
  masterBibleError: string | null;
  masterBibleSyncMode: MasterBibleSyncMode;
  masterBibleSyncNotice: string | null;
  orchestratorPrefill: OrchestratorPrefill | null;
  firebaseUser: FirebaseAuthUserSummary | null;
  firebaseAuthLoading: boolean;
  firebaseSyncStatus: FirestoreSyncStatus;
  firebaseModalOpen: boolean;
  setupGuideOpen: boolean;
  onSelectFloorView: (view: FloorViewMode) => void;
  onSelectZone: (zone: OfficeZoneId) => void;
  onSelectDivision: (divisionId: WorkspaceDivisionId) => void;
  onToggleSidebar: () => void;
  onOpenFirebaseAuth: () => void;
  onCloseFirebaseAuth: () => void;
  onOpenSetupGuide: () => void;
  onCloseSetupGuide: (dontShowAgain: boolean) => void;
  onSyncFirebaseNow: () => Promise<void>;
  onSelectLighting: (preset: LightingPreset) => void;
  onSelectSpeed: (speed: number) => void;
  onSelectAgent: (floorId: FloorId, agentId: AgentId | null) => void;
  onOpenAgentRoster: () => void;
  onCloseAgentRoster: () => void;
  onCloseProviderSettings: () => void;
  onSaveProviderConfig: (next: ProviderConfig) => void;
  onResetProviderConfig: () => void;
  onOpenChannelTemplates: () => void;
  onVoiceSynthesisEvent: (phase: 'start' | 'done' | 'error', label: string) => void;
  onSelectSpecialist: (floorId: FloorId, specialist: SpecialistAgentProfile | null) => void;
  onSubmitSpecialistTask: (
    floorId: FloorId,
    specialist: SpecialistAgentProfile,
    prompt: string
  ) => void;
  onRunCommand: (command: OfficeCommand) => void;
  onRunFloorCommand: (floorId: FloorId, command: OfficeCommand) => void;
  onOpenFloorDashboard: (floorId?: FloorId) => void;
  onCloseFloorDashboard: () => void;
  onOpenFloorWorkflow: (floorId: FloorId) => void;
  onCloseFloorWorkflow: () => void;
  onOpenOrchestratorForFloor: (
    floorId: FloorId,
    prefill?: Omit<OrchestratorPrefill, 'nonce'>
  ) => void;
  onUploadMasterBibleFile: (file: File) => Promise<void>;
  onClearMasterBible: () => Promise<void>;
  onDevotionalResearchEvent: (phase: 'start' | 'done' | 'error', detail: string) => void;
  onCloseControls: () => void;
  onToggleMediaStudio: () => void;
  onToggleShortsFactory: () => void;
  onToggleOrchestrator: () => void;
  onOpenProviderSettingsFromOrchestrator: () => void;
  onOrchestratorStageEvent: (ev: OrchestratorStageEvent) => void;
  onCloseDivisionTool: () => void;
  onMediaCreated: (item: GeneratedMediaItem) => void;
  onProjectVideo: (item: GeneratedMediaItem | null) => void;
  onMountGalleryImage: (dataUrl: string | null, label?: string) => void;
  onSubmitAgentTask: (floorId: FloorId, agentId: AgentId, prompt: string) => void;
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
  buildingState,
  floorView,
  activeFloorId,
  activityLog,
  activeZone,
  activeDivision,
  sidebarCollapsed,
  lighting,
  simSpeed,
  selectedTarget,
  tasksByFloorAgent,
  workHistory,
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
  orchestratorOpen,
  floorDashboardOpen,
  floorWorkflowFloorId,
  controlsOpen,
  providerConfig,
  selectedSpecialistId,
  masterBible,
  masterBibleBusy,
  masterBibleError,
  masterBibleSyncMode,
  masterBibleSyncNotice,
  orchestratorPrefill,
  firebaseUser,
  firebaseAuthLoading,
  firebaseSyncStatus,
  firebaseModalOpen,
  setupGuideOpen,
  onSelectFloorView,
  onSelectZone,
  onSelectDivision,
  onToggleSidebar,
  onOpenFirebaseAuth,
  onCloseFirebaseAuth,
  onOpenSetupGuide,
  onCloseSetupGuide,
  onSyncFirebaseNow,
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
  onNarrationAudioCreated,
  onSelectSpecialist,
  onSubmitSpecialistTask,
  onRunCommand,
  onRunFloorCommand,
  onOpenFloorDashboard,
  onCloseFloorDashboard,
  onOpenFloorWorkflow,
  onCloseFloorWorkflow,
  onOpenOrchestratorForFloor,
  onUploadMasterBibleFile,
  onClearMasterBible,
  onDevotionalResearchEvent,
  onCloseControls,
  onToggleMediaStudio,
  onToggleShortsFactory,
  onToggleOrchestrator,
  onOpenProviderSettingsFromOrchestrator,
  onOrchestratorStageEvent,
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
  const [providerInitialTab, setProviderInitialTab] = useState<ProviderTab>('ollama');
  const isDark = lighting === 'malam';
  const pwa = usePWA();
  const activeFloorSim = buildingState.floors[activeFloorId];
  const activeFloorCfg = BUILDING_FLOORS[activeFloorId];
  const selectedAgent = selectedTarget
    ? buildingState.floors[selectedTarget.floorId].agents[selectedTarget.agentId]
    : null;
  const divisionMeta = getDivisionById(activeDivision);

  const buildingSummary = useMemo(
    () => computeBuildingUtilization(buildingState, 'all'),
    [buildingState]
  );

  const surfaceClass = isDark
    ? 'border-slate-700/90 bg-[#0f172a]/94 text-slate-100'
    : 'border-slate-200/95 bg-[#fcfbf8]/95 text-slate-900';

  const mutedTextClass = isDark ? 'text-slate-400' : 'text-slate-600';

  return (
    <>
      <WorkspaceSidebar
        activeDivision={activeDivision}
        collapsed={sidebarCollapsed}
        floorView={floorView}
        utilizationPercent={buildingSummary.utilizationPercent}
        activeEmployeeCount={buildingSummary.activeCount}
        totalEmployeeCount={buildingSummary.total}
        firebaseUser={firebaseUser}
        pwa={pwa}
        onSelectDivision={onSelectDivision}
        onSelectFloorView={onSelectFloorView}
        onToggleCollapse={onToggleSidebar}
        onOpenFirebaseAuth={onOpenFirebaseAuth}
      />

      <div
        className={`pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 transition-[padding] duration-200 sm:p-5 ${
          sidebarCollapsed ? 'pl-[74px] sm:pl-[78px]' : 'pl-[74px] md:pl-[246px]'
        }`}
      >
        {/* Minimal Corner Header: Compact Brand (Left) & Collapsible Activity Log (Right) — 100% Unobstructed 3D Center */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div
            className={`pointer-events-auto rounded-xl border px-4 py-2 shadow-sm transition-colors duration-200 ${surfaceClass}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight sm:text-base">Kantor AI 3D</h1>
              <span className={`text-xs ${mutedTextClass}`} aria-hidden="true">
                ·
              </span>
              <span className={`text-xs font-medium ${mutedTextClass}`}>
                {floorView === 'all' ? 'Menara 3 Lantai' : activeFloorCfg.shortLabel}
              </span>
              <span className={`text-xs ${mutedTextClass}`} aria-hidden="true">
                ·
              </span>
              <span className={`text-xs ${mutedTextClass}`}>{divisionMeta.divisionName}</span>
            </div>
            <p className={`mt-0.5 text-[11px] tabular-nums ${mutedTextClass}`}>
              <span>{TOTAL_BUILDING_EMPLOYEES} Agen AI</span>
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              <span>{MODE_LABELS[activeFloorSim.officeMode]}</span>
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              <span>{LIGHTING_LABELS[lighting]}</span>
              {buildingState.completedTaskCount > 0 && (
                <>
                  <span className="mx-1.5" aria-hidden="true">
                    ·
                  </span>
                  <span>{buildingState.completedTaskCount} Tugas Selesai</span>
                </>
              )}
            </p>
          </div>

          <ActivityLogPanel
            entries={activityLog}
            lighting={lighting}
            selectedAgentId={selectedTarget?.agentId ?? null}
            onSelectAgent={(id) => onSelectAgent(activeFloorId, id)}
          />
        </header>

        {/* On-Demand Menu Drawers Only (Zero Persistent Floating Bottom Dock Over the 3D Scene) */}
        <div className="mx-auto flex w-full max-w-[min(1180px,100%)] flex-col items-center">
          {floorWorkflowFloorId !== null && (
            <FloorWorkflowDrawer
              floorId={floorWorkflowFloorId}
              buildingState={buildingState}
              lighting={lighting}
              shortsQueue={shortsQueue}
              channelTemplates={channelTemplates}
              tasksByFloorAgent={tasksByFloorAgent}
              masterBible={masterBible}
              masterBibleBusy={masterBibleBusy}
              masterBibleError={masterBibleError}
              masterBibleSyncMode={masterBibleSyncMode}
              masterBibleSyncNotice={masterBibleSyncNotice}
              firebaseSignedIn={Boolean(firebaseUser)}
              onOpenFirebaseAuth={onOpenFirebaseAuth}
              onUploadMasterBibleFile={onUploadMasterBibleFile}
              onClearMasterBible={onClearMasterBible}
              onSelectFloorTab={onOpenFloorWorkflow}
              onFocusEmployeeIn3D={(fid, id) => onSelectAgent(fid, id)}
              onOpenOrchestratorForFloor={onOpenOrchestratorForFloor}
              onOpenFloorDashboard={(fid) => onOpenFloorDashboard(fid)}
              onOpenChannelTemplates={onOpenChannelTemplates}
              onDevotionalResearchEvent={onDevotionalResearchEvent}
              onClose={onCloseFloorWorkflow}
            />
          )}

          {floorWorkflowFloorId === null && floorDashboardOpen && (
            <FloorDashboardDrawer
              buildingState={buildingState}
              activeFloorId={activeFloorId}
              lighting={lighting}
              tasksByFloorAgent={tasksByFloorAgent}
              workHistory={workHistory}
              shortsQueue={shortsQueue}
              onSelectFloor={(fid) => onSelectFloorView(fid)}
              onFocusEmployeeIn3D={(fid, id) => onSelectAgent(fid, id)}
              onRunFloorCommand={onRunFloorCommand}
              onSubmitFloorTask={onSubmitAgentTask}
              onClose={onCloseFloorDashboard}
            />
          )}

          {floorWorkflowFloorId === null && !floorDashboardOpen && controlsOpen && (
            <OfficeControlsDrawer
              buildingState={buildingState}
              floorView={floorView}
              activeFloorId={activeFloorId}
              activeZone={activeZone}
              lighting={lighting}
              simSpeed={simSpeed}
              selectedTarget={selectedTarget}
              onSelectFloorView={onSelectFloorView}
              onSelectZone={onSelectZone}
              onSelectLighting={onSelectLighting}
              onSelectSpeed={onSelectSpeed}
              onSelectAgent={onSelectAgent}
              onRunCommand={onRunCommand}
              onOpenFloorDashboard={() => onOpenFloorDashboard()}
              onOpenMediaStudio={onToggleMediaStudio}
              onOpenOrchestrator={onToggleOrchestrator}
              onOpenShortsFactory={onToggleShortsFactory}
              onClose={onCloseControls}
            />
          )}

          {floorWorkflowFloorId === null &&
            !floorDashboardOpen &&
            !controlsOpen &&
            providerSettingsOpen && (
              <ProviderSettingsDrawer
                lighting={lighting}
                config={providerConfig}
                initialTab={providerInitialTab}
                firebaseUser={firebaseUser}
                firebaseSyncStatus={firebaseSyncStatus}
                onSaveConfig={onSaveProviderConfig}
                onResetConfig={onResetProviderConfig}
                onOpenChannelTemplates={onOpenChannelTemplates}
                onOpenFirebaseAuth={onOpenFirebaseAuth}
                onOpenSetupGuide={onOpenSetupGuide}
                onVoiceSynthesisEvent={onVoiceSynthesisEvent}
                onClose={() => {
                  setProviderInitialTab('ollama');
                  onCloseProviderSettings();
                }}
              />
            )}

          {floorWorkflowFloorId === null &&
            !floorDashboardOpen &&
            !controlsOpen &&
            !providerSettingsOpen &&
            agentRosterOpen && (
              <AgentRosterDrawer
                buildingState={buildingState}
                activeFloorId={activeFloorId}
                lighting={lighting}
                selectedSpecialistId={selectedSpecialistId}
                tasksByFloorAgent={tasksByFloorAgent}
                onSelectFloor={(fid) => onSelectFloorView(fid)}
                onSelectSpecialist={onSelectSpecialist}
                onSubmitSpecialistTask={onSubmitSpecialistTask}
                onOpenDivision={onSelectDivision}
                onClose={onCloseAgentRoster}
              />
            )}

          {floorWorkflowFloorId === null &&
            !floorDashboardOpen &&
            !controlsOpen &&
            !providerSettingsOpen &&
            !agentRosterOpen &&
            divisionToolMode && (
              <DivisionToolsDrawer
                mode={divisionToolMode}
                lighting={lighting}
                queue={shortsQueue}
                schedule={weeklySchedule}
                simState={activeFloorSim}
                mediaItems={mediaItems}
                onClose={onCloseDivisionTool}
                onUpdateScheduleSlot={onUpdateScheduleSlot}
                onSendClipToProduction={onSendClipToProduction}
              />
            )}

          {floorWorkflowFloorId === null &&
            !floorDashboardOpen &&
            !controlsOpen &&
            !providerSettingsOpen &&
            !agentRosterOpen &&
            !divisionToolMode &&
            orchestratorOpen && (
              <ProductionOrchestratorDrawer
                lighting={lighting}
                initialChannelId={activeFloorCfg.channelId}
                externalPrefill={orchestratorPrefill}
                masterBibleSourceName={masterBible?.report.sourceName ?? null}
                masterBibleVerseCount={masterBible?.report.indexedVerseCount ?? 0}
                channelTemplates={channelTemplates}
                providerConfig={providerConfig}
                onClose={onToggleOrchestrator}
                onOpenShortsFactory={onToggleShortsFactory}
                onOpenProviderSettings={onOpenProviderSettingsFromOrchestrator}
                onStageEvent={onOrchestratorStageEvent}
                onSaveToQueue={onUpsertShortsQueueItem}
                onProjectFinalVideo={(item) => {
                  onMediaCreated(item);
                  onProjectVideo(item);
                }}
              />
            )}

          {floorWorkflowFloorId === null &&
            !floorDashboardOpen &&
            !controlsOpen &&
            !providerSettingsOpen &&
            !agentRosterOpen &&
            !divisionToolMode &&
            !orchestratorOpen &&
            shortsFactoryOpen && (
              <ShortsFactoryDrawer
                lighting={lighting}
                masterBible={masterBible}
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

          {floorWorkflowFloorId === null &&
            !floorDashboardOpen &&
            !controlsOpen &&
            !providerSettingsOpen &&
            !agentRosterOpen &&
            !divisionToolMode &&
            !orchestratorOpen &&
            !shortsFactoryOpen &&
            mediaStudioOpen && (
              <MediaStudioDrawer
                activeFloorId={activeFloorId}
                lighting={lighting}
                items={mediaItems}
                projectedVideoId={projectedVideoId}
                mountedImageUrl={mountedImageUrl}
                prefill={mediaStudioPrefill}
                onClose={onToggleMediaStudio}
                onMediaCreated={onMediaCreated}
                onProjectVideo={onProjectVideo}
                onMountGalleryImage={onMountGalleryImage}
                providerConfig={providerConfig}
                onVoiceSynthesisEvent={onVoiceSynthesisEvent}
                onNarrationAudioCreated={onNarrationAudioCreated}
              />
            )}

          {floorWorkflowFloorId === null &&
            !floorDashboardOpen &&
            !controlsOpen &&
            !providerSettingsOpen &&
            !agentRosterOpen &&
            !divisionToolMode &&
            !orchestratorOpen &&
            !shortsFactoryOpen &&
            !mediaStudioOpen &&
            selectedTarget &&
            selectedAgent && (
              <AgentTaskDrawer
                floorId={selectedTarget.floorId}
                agent={selectedAgent}
                tasks={
                  tasksByFloorAgent[
                    makeFloorAgentKey(selectedTarget.floorId, selectedTarget.agentId)
                  ] ?? []
                }
                lighting={lighting}
                onClose={() => onSelectAgent(selectedTarget.floorId, null)}
                onOpenAgentRoster={onOpenAgentRoster}
                onSubmitTask={(prompt) =>
                  onSubmitAgentTask(selectedTarget.floorId, selectedTarget.agentId, prompt)
                }
              />
            )}
        </div>
      </div>

      <FirebaseAuthModal
        open={firebaseModalOpen}
        lighting={lighting}
        authLoading={firebaseAuthLoading}
        user={firebaseUser}
        syncStatus={firebaseSyncStatus}
        onSyncNow={onSyncFirebaseNow}
        onClose={onCloseFirebaseAuth}
      />

      <SetupGuideModal
        open={setupGuideOpen}
        lighting={lighting}
        firebaseUser={firebaseUser}
        onOpenFirebaseAuth={onOpenFirebaseAuth}
        onOpenProviderSettings={() => {
          setProviderInitialTab('gemini');
          onOpenProviderSettingsFromOrchestrator();
        }}
        onClose={onCloseSetupGuide}
      />

      <PWAStatusToast pwa={pwa} />
    </>
  );
}
