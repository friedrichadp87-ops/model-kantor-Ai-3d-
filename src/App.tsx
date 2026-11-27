import { useCallback, useEffect, useRef, useState } from 'react';
import { OfficeHUD } from './components/OfficeHUD';
import { OfficeViewport, type OfficeViewportHandle } from './components/OfficeViewport';
import type { MediaStudioPrefill } from './components/MediaStudioDrawer';
import type { DivisionToolMode } from './components/DivisionToolsDrawer';
import type {
  FactoryTab,
  ShortsBriefPrefill,
  ShortsProductionEvent,
} from './components/ShortsFactoryDrawer';
import type {
  OrchestratorPrefill,
  OrchestratorStageEvent,
} from './components/ProductionOrchestratorDrawer';
import {
  deleteMasterBibleFromFirestore,
  loadMasterBibleFromFirestore,
  subscribeAuthUser,
  subscribeShortsQueue,
  subscribeWorkspaceSettings,
  syncAgentTaskToFirestore,
  syncMasterBibleToFirestore,
  syncShortsQueueItemToFirestore,
  syncUserProfileToFirestore,
  syncWorkspaceSettingsToFirestore,
  testFirestoreConnection,
  type FirestoreSyncStatus,
} from './firebase/client';
import type { FirebaseAuthUserSummary } from './firebase/officeSync';
import {
  appendActivityLog,
  createInitialActivityLog,
  diffAgentActivityEvents,
  type ActivityLogEntry,
} from './office/activityLog';
import {
  BUILDING_FLOORS,
  FLOOR_ORDER,
  TOTAL_BUILDING_EMPLOYEES,
  createInitialBuildingState,
  getChannelIdByFloor,
  getFloorByChannelId,
  getFloorEmployeeIdentity,
  makeFloorAgentKey,
  type BuildingSimulationState,
  type FloorId,
  type FloorViewMode,
} from './office/buildingFloors';
import {
  createStudioActivityEntry,
  type GeneratedMediaItem,
  type VideoAspectRatio,
} from './office/mediaStudio';
import {
  CHANNEL_TEMPLATES_STORAGE_KEY,
  createDefaultChannelTemplates,
  createInitialShortsQueue,
  getChannelById,
  mergeChannelTemplates,
  type ChannelTemplateConfig,
  type ChannelTemplatesMap,
  type LocalBibleDatabase,
  type QueueStage,
  type ShortsChannelId,
  type ShortsDuration,
  type ShortsQueueItem,
} from './office/shortsFactory';
import {
  buildMasterBibleSystemPolicy,
  parseMasterBibleContent,
  syncMasterBibleToBackend,
  type MasterBibleSyncMode,
} from './office/masterBible';
import {
  clearMasterBibleFromIndexedDb,
  loadMasterBibleFromIndexedDb,
  saveMasterBibleToIndexedDb,
} from './office/masterBibleStorage';
import {
  createDefaultWeeklySchedule,
  getDivisionById,
  type PublicationSlot,
  type WorkspaceDivisionId,
} from './office/workspaceDivisions';
import {
  getDivisionIdFromFloor,
  getFloorIdFromDivision,
} from './office/floorWorkflowView';
import {
  getSpecialistById,
  type SpecialistAgentId,
  type SpecialistAgentProfile,
} from './office/agentRoster';
import {
  PROVIDER_CONFIG_STORAGE_KEY,
  createDefaultProviderConfig,
  mergeProviderConfig,
  type ProviderConfig,
} from './office/providerConfig';
import { AGENT_ORDER, CAMERA_PRESET_ORDER } from './office/layout';
import type {
  AgentId,
  LightingPreset,
  OfficeCommand,
  OfficeZoneId,
  TaskEntry,
} from './office/types';
import {
  readSetupGuideDismissed,
  shouldAutoOpenSetupGuide,
  writeSetupGuideDismissed,
} from './office/setupGuide';

function createInitialFloorTasksMap(): Record<string, TaskEntry[]> {
  const map: Record<string, TaskEntry[]> = {};
  for (const floorId of FLOOR_ORDER) {
    for (const agentId of AGENT_ORDER) {
      map[makeFloorAgentKey(floorId, agentId)] = [];
    }
  }
  return map;
}

export default function App() {
  const viewportRef = useRef<OfficeViewportHandle | null>(null);

  const initialBuilding = useRef<BuildingSimulationState | null>(null);
  if (!initialBuilding.current) {
    initialBuilding.current = createInitialBuildingState();
  }
  const prevBuildingRef = useRef<BuildingSimulationState>(initialBuilding.current);

  const [buildingState, setBuildingState] = useState<BuildingSimulationState>(
    initialBuilding.current
  );
  const [floorView, setFloorView] = useState<FloorViewMode>('all');
  const [activeFloorId, setActiveFloorId] = useState<FloorId>(1);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(() =>
    createInitialActivityLog(initialBuilding.current!.floors[1])
  );
  const [activeZone, setActiveZone] = useState<OfficeZoneId>('overview');
  const [activeDivision, setActiveDivision] = useState<WorkspaceDivisionId>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [lighting, setLighting] = useState<LightingPreset>('pagi');
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [selectedTarget, setSelectedTarget] = useState<{
    floorId: FloorId;
    agentId: AgentId;
  } | null>(null);
  const [mediaStudioOpen, setMediaStudioOpen] = useState<boolean>(false);
  const [mediaStudioPrefill, setMediaStudioPrefill] = useState<MediaStudioPrefill | null>(null);
  const [mediaItems, setMediaItems] = useState<GeneratedMediaItem[]>([]);
  const [projectedVideoId, setProjectedVideoId] = useState<string | null>(null);
  const [mountedImageUrl, setMountedImageUrl] = useState<string | null>(null);
  const [shortsFactoryOpen, setShortsFactoryOpen] = useState<boolean>(false);
  const [shortsFactoryTab, setShortsFactoryTab] = useState<FactoryTab>('produksi');
  const [shortsFactoryTabNonce, setShortsFactoryTabNonce] = useState<number>(0);
  const [shortsBriefPrefill, setShortsBriefPrefill] = useState<ShortsBriefPrefill | null>(null);
  const [divisionToolMode, setDivisionToolMode] = useState<DivisionToolMode | null>(null);
  const [agentRosterOpen, setAgentRosterOpen] = useState<boolean>(false);
  const [providerSettingsOpen, setProviderSettingsOpen] = useState<boolean>(false);
  const [orchestratorOpen, setOrchestratorOpen] = useState<boolean>(false);
  const [floorDashboardOpen, setFloorDashboardOpen] = useState<boolean>(false);
  const [floorWorkflowFloorId, setFloorWorkflowFloorId] = useState<FloorId | null>(null);
  const [controlsOpen, setControlsOpen] = useState<boolean>(false);
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<SpecialistAgentId | null>(null);
  const [masterBible, setMasterBible] = useState<LocalBibleDatabase | null>(null);
  const masterBibleRef = useRef<LocalBibleDatabase | null>(null);
  masterBibleRef.current = masterBible;
  const [masterBibleBusy, setMasterBibleBusy] = useState<boolean>(false);
  const [masterBibleError, setMasterBibleError] = useState<string | null>(null);
  const [masterBibleSyncMode, setMasterBibleSyncMode] =
    useState<MasterBibleSyncMode>('server-synced');
  const [masterBibleSyncNotice, setMasterBibleSyncNotice] = useState<string | null>(null);
  const [orchestratorPrefill, setOrchestratorPrefill] = useState<OrchestratorPrefill | null>(null);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>(() => {
    try {
      const raw = window.localStorage.getItem(PROVIDER_CONFIG_STORAGE_KEY);
      if (!raw) return createDefaultProviderConfig();
      return mergeProviderConfig(JSON.parse(raw));
    } catch {
      return createDefaultProviderConfig();
    }
  });
  const [shortsQueue, setShortsQueue] = useState<ShortsQueueItem[]>(createInitialShortsQueue);
  const [weeklySchedule, setWeeklySchedule] = useState<PublicationSlot[]>(() =>
    createDefaultWeeklySchedule(createInitialShortsQueue())
  );
  const [channelTemplates, setChannelTemplates] = useState<ChannelTemplatesMap>(() => {
    try {
      const raw = window.localStorage.getItem(CHANNEL_TEMPLATES_STORAGE_KEY);
      if (!raw) return createDefaultChannelTemplates();
      return mergeChannelTemplates(JSON.parse(raw));
    } catch {
      return createDefaultChannelTemplates();
    }
  });
  const [tasksByFloorAgent, setTasksByFloorAgent] = useState<Record<string, TaskEntry[]>>(
    createInitialFloorTasksMap
  );
  const [firebaseUser, setFirebaseUser] = useState<FirebaseAuthUserSummary | null>(null);
  const [firebaseAuthLoading, setFirebaseAuthLoading] = useState<boolean>(true);
  const [firebaseModalOpen, setFirebaseModalOpen] = useState<boolean>(false);
  const [setupGuideOpen, setSetupGuideOpen] = useState<boolean>(() =>
    shouldAutoOpenSetupGuide({
      dismissedFlag: readSetupGuideDismissed(),
      searchQuery: typeof window !== 'undefined' ? window.location.search : '',
    })
  );
  const handleCloseSetupGuide = useCallback((dontShowAgain: boolean) => {
    writeSetupGuideDismissed(dontShowAgain);
    setSetupGuideOpen(false);
  }, []);
  const handleOpenSetupGuide = useCallback(() => {
    setSetupGuideOpen(true);
  }, []);
  const [firebaseSyncStatus, setFirebaseSyncStatus] = useState<FirestoreSyncStatus>({
    connection: 'checking',
    state: 'idle',
    lastSyncedAt: null,
    message: 'Memeriksa koneksi ke proyek Firebase kantor-ai-agent-creator...',
    blockedPath: null,
  });

  // Startup non-blocking Firestore connectivity validation + Firebase Auth listener
  useEffect(() => {
    let active = true;
    void testFirestoreConnection().then((res) => {
      if (!active) return;
      setFirebaseSyncStatus((prev) => ({
        ...prev,
        connection: res.connection,
        message: prev.state === 'idle' ? res.detail : prev.message,
      }));
    });

    const unsubAuth = subscribeAuthUser((user) => {
      setFirebaseUser(user);
      setFirebaseAuthLoading(false);
      if (user) {
        setActivityLog((prev) =>
          appendActivityLog(prev, [
            createStudioActivityEntry(
              `Firebase Auth aktif: ${user.displayName || user.email || user.uid}`
            ),
          ])
        );
      } else {
        setFirebaseSyncStatus((prev) => ({
          ...prev,
          state: 'idle',
          blockedPath: null,
          message:
            'Mode pratinjau lokal aktif. Masuk melalui Firebase Authentication untuk sinkronisasi Firestore.',
        }));
      }
    });

    return () => {
      active = false;
      unsubAuth();
    };
  }, []);

  // Hydrate building-wide Master Alkitab Terjemahan Baru (TB) from IndexedDB and sync to backend memory
  useEffect(() => {
    let active = true;
    void loadMasterBibleFromIndexedDb().then(async (saved) => {
      if (!active || !saved) return;
      setMasterBible(saved);
      const outcome = await syncMasterBibleToBackend(saved);
      if (!active) return;
      setMasterBibleSyncMode(outcome.mode);
      setMasterBibleSyncNotice(outcome.notice);
      setActivityLog((prev) =>
        appendActivityLog(prev, [
          createStudioActivityEntry(
            `Master Alkitab TB aktif di L1, L2 & L3 (${saved.report.sourceName} · ${saved.report.indexedVerseCount.toLocaleString('id-ID')} ayat${outcome.mode === 'local-only' ? ' · Mode Lokal' : ''})`
          ),
        ])
      );
    });
    return () => {
      active = false;
    };
  }, []);

  // Attach real-time Firestore listeners only when authenticated (never blocks preview)
  useEffect(() => {
    if (!firebaseUser) return;
    const uid = firebaseUser.uid;

    setFirebaseSyncStatus((prev) => ({
      ...prev,
      state: 'syncing',
      message: 'Menyinkronkan profil & data Kantor AI ke Cloud Firestore...',
    }));

    void syncUserProfileToFirestore(firebaseUser).then((result) => {
      if (!result.ok && result.permissionDenied) {
        setFirebaseSyncStatus((prev) => ({
          ...prev,
          state: 'permission-denied',
          blockedPath: result.path,
          message:
            'Login Firebase berhasil, namun Firestore Rules proyek Anda belum mengizinkan penulisan ke koleksi Kantor AI 3D.',
        }));
      } else if (result.ok) {
        setFirebaseSyncStatus((prev) => ({
          ...prev,
          connection: 'connected',
          state: 'synced',
          lastSyncedAt: new Date().toISOString(),
          blockedPath: null,
          message: 'Tersinkronisasi otomatis dengan Cloud Firestore (kantor-ai-agent-creator).',
        }));
      }
    });

    const handleSubError = (info: { permissionDenied: boolean; path: string; message: string }) => {
      setFirebaseSyncStatus((prev) => ({
        ...prev,
        state: info.permissionDenied ? 'permission-denied' : 'error',
        blockedPath: info.permissionDenied ? info.path : prev.blockedPath,
        message: info.permissionDenied
          ? `Firestore Rules menolak pembacaan pada ${info.path}. Kirimkan isi Firestore Rules Anda agar dapat disesuaikan.`
          : `Sinkronisasi Firestore tertunda: ${info.message}`,
      }));
    };

    const unsubSettings = subscribeWorkspaceSettings(
      uid,
      (cloud) => {
        if (cloud.channelTemplates) {
          setChannelTemplates(cloud.channelTemplates);
          try {
            window.localStorage.setItem(
              CHANNEL_TEMPLATES_STORAGE_KEY,
              JSON.stringify(cloud.channelTemplates)
            );
          } catch {
            // Ignore local storage errors
          }
        }
        if (cloud.providerConfig) {
          setProviderConfig(cloud.providerConfig);
          try {
            window.localStorage.setItem(
              PROVIDER_CONFIG_STORAGE_KEY,
              JSON.stringify(cloud.providerConfig)
            );
          } catch {
            // Ignore local storage errors
          }
        }
        setFirebaseSyncStatus((prev) => ({
          ...prev,
          connection: 'connected',
          state: 'synced',
          lastSyncedAt: new Date().toISOString(),
          blockedPath: null,
          message: 'Pengaturan workspace & template 3 channel tersinkronisasi dengan Cloud Firestore.',
        }));
      },
      handleSubError
    );

    const unsubQueue = subscribeShortsQueue(
      uid,
      (items) => {
        setShortsQueue(items);
        setFirebaseSyncStatus((prev) => ({
          ...prev,
          connection: 'connected',
          state: 'synced',
          lastSyncedAt: new Date().toISOString(),
          blockedPath: null,
          message: `${items.length} proyek YouTube Shorts tersinkronisasi dari Cloud Firestore.`,
        }));
      },
      handleSubError
    );

    // Sync Master Alkitab Terjemahan Baru (TB) bi-directionally with Firebase Cloud Firestore
    let bibleSyncActive = true;
    void loadMasterBibleFromFirestore(uid).then(async (cloudRes) => {
      if (!bibleSyncActive) return;
      if (!cloudRes.ok && cloudRes.permissionDenied) {
        if (masterBibleRef.current) {
          setMasterBibleSyncMode('local-only');
          setMasterBibleSyncNotice(
            'Alkitab aktif di browser. Tambahkan aturan Firestore Rules untuk masterBible & masterBibleChunks (buka menu Firebase) agar tersimpan di Cloud.'
          );
        }
        return;
      }

      const cloudBible = cloudRes.database;
      if (cloudBible) {
        await saveMasterBibleToIndexedDb(cloudBible).catch(() => undefined);
        if (!bibleSyncActive) return;
        setMasterBible(cloudBible);
        setMasterBibleSyncMode('firebase-synced');
        setMasterBibleSyncNotice(null);
        void syncMasterBibleToBackend(cloudBible);
        setActivityLog((prev) =>
          appendActivityLog(prev, [
            createStudioActivityEntry(
              `Master Alkitab TB dimuat dari Firebase Cloud Firestore (${cloudBible.report.bookCount} kitab · ${cloudBible.report.indexedVerseCount.toLocaleString('id-ID')} ayat)`
            ),
          ])
        );
        return;
      }

      // Firestore does not have Master Alkitab yet — push local IndexedDB copy automatically!
      const localBible = masterBibleRef.current ?? (await loadMasterBibleFromIndexedDb());
      if (!bibleSyncActive || !localBible) return;
      const pushRes = await syncMasterBibleToFirestore(uid, localBible);
      if (!bibleSyncActive) return;
      if (pushRes.ok) {
        setMasterBibleSyncMode('firebase-synced');
        setMasterBibleSyncNotice(
          `Tersimpan di Firebase Firestore (${pushRes.chunkCount ?? 1} bagian) — otomatis sinkron di PC, Android & Netlify.`
        );
        setActivityLog((prev) =>
          appendActivityLog(prev, [
            createStudioActivityEntry(
              `Master Alkitab TB berhasil disinkronkan ke Firebase Cloud Firestore (${localBible.report.indexedVerseCount.toLocaleString('id-ID')} ayat)`
            ),
          ])
        );
      } else if (pushRes.permissionDenied) {
        setMasterBibleSyncNotice(
          'Alkitab aktif di browser. Tambahkan aturan Firestore Rules untuk masterBible & masterBibleChunks (buka panel Firebase) agar tersimpan di Cloud.'
        );
      }
    });

    return () => {
      bibleSyncActive = false;
      unsubSettings();
      unsubQueue();
    };
  }, [firebaseUser]);

  const handleSyncFirebaseNow = useCallback(async () => {
    if (!firebaseUser) return;
    setFirebaseSyncStatus((prev) => ({
      ...prev,
      state: 'syncing',
      message: 'Mengirim data Kantor AI 3D ke Cloud Firestore...',
    }));
    const profileRes = await syncUserProfileToFirestore(firebaseUser);
    const settingsRes = await syncWorkspaceSettingsToFirestore(
      firebaseUser.uid,
      channelTemplates,
      providerConfig
    );
    const queueResults = await Promise.all(
      shortsQueue.slice(0, 12).map((item) => syncShortsQueueItemToFirestore(firebaseUser.uid, item))
    );
    const bibleRes = masterBible
      ? await syncMasterBibleToFirestore(firebaseUser.uid, masterBible)
      : null;
    if (bibleRes?.ok) {
      setMasterBibleSyncMode('firebase-synced');
      setMasterBibleSyncNotice(
        `Tersimpan di Firebase Firestore (${bibleRes.chunkCount ?? 1} bagian) — otomatis sinkron di PC, Android & Netlify.`
      );
    }
    const allResults = bibleRes
      ? [profileRes, settingsRes, ...queueResults, bibleRes]
      : [profileRes, settingsRes, ...queueResults];
    const firstDenied = allResults.find((r) => r.permissionDenied);
    if (firstDenied) {
      setFirebaseSyncStatus((prev) => ({
        ...prev,
        state: 'permission-denied',
        blockedPath: firstDenied.path,
        message: `Firestore Rules menolak penulisan ke ${firstDenied.path}. Salin aturan Firestore Rules pada panel ini lalu publikasikan di Firebase Console.`,
      }));
      return;
    }
    const firstError = allResults.find((r) => !r.ok);
    if (firstError) {
      setFirebaseSyncStatus((prev) => ({
        ...prev,
        state: 'error',
        message: firstError.errorMessage || 'Gagal menyinkronkan sebagian data ke Firestore.',
      }));
      return;
    }
    setFirebaseSyncStatus((prev) => ({
      ...prev,
      connection: 'connected',
      state: 'synced',
      lastSyncedAt: new Date().toISOString(),
      blockedPath: null,
      message: `Sinkronisasi berhasil (${shortsQueue.length} item antrean, template 3 channel${masterBible ? ', & Master Alkitab TB' : ''} tersimpan di Firestore).`,
    }));
  }, [firebaseUser, channelTemplates, providerConfig, shortsQueue, masterBible]);

  const handleStateSnapshot = useCallback((next: BuildingSimulationState) => {
    const prevBuilding = prevBuildingRef.current;
    const incoming: ActivityLogEntry[] = [];
    for (const fid of FLOOR_ORDER) {
      const floorEvents = diffAgentActivityEvents(prevBuilding.floors[fid], next.floors[fid]);
      for (const ev of floorEvents) {
        incoming.push({
          ...ev,
          id: `f${fid}_${ev.id}`,
          message: `[L${fid}] ${ev.message}`,
        });
      }
    }
    prevBuildingRef.current = next;
    setBuildingState(next);
    if (incoming.length > 0) {
      setActivityLog((prev) => appendActivityLog(prev, incoming));
    }
  }, []);

  const handleSelectFloorView = useCallback((view: FloorViewMode) => {
    setFloorView(view);
    if (view !== 'all') {
      setActiveFloorId(view);
    }
    setSelectedTarget(null);
    setActiveZone('overview');
    viewportRef.current?.selectAgent(null, null, false);
    viewportRef.current?.setFloorView(view);
  }, []);

  const handleAgentClicked = useCallback((floorId: FloorId, agentId: AgentId) => {
    setFloorWorkflowFloorId(null);
    setFloorDashboardOpen(false);
    setControlsOpen(false);
    setAgentRosterOpen(false);
    setProviderSettingsOpen(false);
    setOrchestratorOpen(false);
    setMediaStudioOpen(false);
    setShortsFactoryOpen(false);
    setDivisionToolMode(null);
    setActiveDivision('ai-agent');
    setActiveFloorId(floorId);
    setSelectedTarget({ floorId, agentId });
  }, []);

  const handleSelectZone = useCallback((zone: OfficeZoneId) => {
    setActiveZone(zone);
    setSelectedTarget(null);
    viewportRef.current?.selectAgent(null, null, false);
    viewportRef.current?.setCameraPreset(zone);
  }, []);

  const handleSelectDivision = useCallback((divisionId: WorkspaceDivisionId) => {
    const div = getDivisionById(divisionId);
    setActiveDivision(divisionId);
    setActiveZone(div.cameraZone);

    const selectedFloorMenu = getFloorIdFromDivision(divisionId);
    if (selectedFloorMenu !== null) {
      setFloorView(selectedFloorMenu);
      setActiveFloorId(selectedFloorMenu);
      setFloorWorkflowFloorId(selectedFloorMenu);
      setFloorDashboardOpen(false);
      setControlsOpen(false);
      setAgentRosterOpen(false);
      setProviderSettingsOpen(false);
      setOrchestratorOpen(false);
      setDivisionToolMode(null);
      setShortsFactoryOpen(false);
      setMediaStudioOpen(false);
      setSelectedTarget(null);
      viewportRef.current?.selectAgent(null, null, false);
      viewportRef.current?.setFloorView(selectedFloorMenu, 'overview');
      return;
    }

    if (divisionId === 'dashboard') {
      setFloorWorkflowFloorId(null);
      setFloorDashboardOpen(false);
      setControlsOpen(false);
      setAgentRosterOpen(false);
      setProviderSettingsOpen(false);
      setOrchestratorOpen(false);
      setDivisionToolMode(null);
      setShortsFactoryOpen(false);
      setMediaStudioOpen(false);
      setSelectedTarget(null);
      viewportRef.current?.selectAgent(null, null, false);
      viewportRef.current?.setCameraPreset('overview');
      return;
    }

    if (divisionId === 'performa-lantai') {
      setFloorWorkflowFloorId(null);
      setControlsOpen(false);
      setAgentRosterOpen(false);
      setProviderSettingsOpen(false);
      setOrchestratorOpen(false);
      setDivisionToolMode(null);
      setShortsFactoryOpen(false);
      setMediaStudioOpen(false);
      setSelectedTarget(null);
      setFloorDashboardOpen(true);
      viewportRef.current?.selectAgent(null, null, false);
      return;
    }

    if (divisionId === 'kontrol-3d') {
      setFloorWorkflowFloorId(null);
      setFloorDashboardOpen(false);
      setAgentRosterOpen(false);
      setProviderSettingsOpen(false);
      setOrchestratorOpen(false);
      setDivisionToolMode(null);
      setShortsFactoryOpen(false);
      setMediaStudioOpen(false);
      setSelectedTarget(null);
      setControlsOpen(true);
      viewportRef.current?.selectAgent(null, null, false);
      return;
    }

    if (divisionId === 'ai-agent') {
      setFloorWorkflowFloorId(null);
      setFloorDashboardOpen(false);
      setControlsOpen(false);
      setProviderSettingsOpen(false);
      setOrchestratorOpen(false);
      setDivisionToolMode(null);
      setShortsFactoryOpen(false);
      setMediaStudioOpen(false);
      setSelectedTarget(null);
      setAgentRosterOpen(true);
      viewportRef.current?.selectAgent(null, null, false);
      viewportRef.current?.setCameraPreset('overview');
      return;
    }

    if (divisionId === 'pengaturan') {
      setFloorWorkflowFloorId(null);
      setFloorDashboardOpen(false);
      setControlsOpen(false);
      setAgentRosterOpen(false);
      setOrchestratorOpen(false);
      setDivisionToolMode(null);
      setShortsFactoryOpen(false);
      setMediaStudioOpen(false);
      setSelectedTarget(null);
      setProviderSettingsOpen(true);
      viewportRef.current?.selectAgent(null, null, false);
      viewportRef.current?.setCameraPreset(div.cameraZone);
      return;
    }

    setFloorWorkflowFloorId(null);
    setFloorDashboardOpen(false);
    setControlsOpen(false);
    setAgentRosterOpen(false);
    setProviderSettingsOpen(false);
    setSelectedTarget(null);
    viewportRef.current?.selectAgent(null, null, false);
    viewportRef.current?.setCameraPreset(div.cameraZone);

    if (divisionId === 'produksi-konten') {
      setDivisionToolMode(null);
      setShortsFactoryOpen(false);
      setMediaStudioOpen(false);
      setOrchestratorOpen(true);
      return;
    }

    setOrchestratorOpen(false);

    if (divisionId === 'video-editor') {
      setDivisionToolMode(null);
      setShortsFactoryOpen(false);
      setMediaStudioOpen(true);
      return;
    }

    if (
      divisionId === 'church-shorts' ||
      divisionId === 'jadwal-publikasi' ||
      divisionId === 'analitik-laporan'
    ) {
      setShortsFactoryOpen(false);
      setMediaStudioOpen(false);
      setDivisionToolMode(divisionId);
      return;
    }

    setDivisionToolMode(null);
    setMediaStudioOpen(false);
    setShortsFactoryOpen(true);
    const tabByDivision: Record<string, FactoryTab> = {
      'guardian-komunitas': 'guardian',
      'channel-youtube': 'channels',
      'bible-series': 'channels',
    };
    setShortsFactoryTab(tabByDivision[divisionId] ?? 'produksi');
    setShortsFactoryTabNonce((n) => n + 1);
  }, []);

  const handleSelectLighting = useCallback((preset: LightingPreset) => {
    setLighting(preset);
    viewportRef.current?.setLightingPreset(preset);
  }, []);

  const handleSelectSpeed = useCallback((speed: number) => {
    setSimSpeed(speed);
    viewportRef.current?.setSimulationSpeed(speed);
  }, []);

  const handleSelectAgent = useCallback((floorId: FloorId, agentId: AgentId | null) => {
    if (agentId) {
      setFloorWorkflowFloorId(null);
      setFloorDashboardOpen(false);
      setControlsOpen(false);
      setAgentRosterOpen(false);
      setProviderSettingsOpen(false);
      setOrchestratorOpen(false);
      setMediaStudioOpen(false);
      setShortsFactoryOpen(false);
      setDivisionToolMode(null);
      setActiveDivision('ai-agent');
      setActiveFloorId(floorId);
      setSelectedTarget({ floorId, agentId });
      viewportRef.current?.selectAgent(floorId, agentId, true);
    } else {
      setSelectedTarget(null);
      viewportRef.current?.selectAgent(null, null, false);
    }
  }, []);

  const handleOpenAgentRoster = useCallback(() => {
    setFloorWorkflowFloorId(null);
    setFloorDashboardOpen(false);
    setControlsOpen(false);
    setSelectedTarget(null);
    setProviderSettingsOpen(false);
    setOrchestratorOpen(false);
    setMediaStudioOpen(false);
    setShortsFactoryOpen(false);
    setDivisionToolMode(null);
    setAgentRosterOpen(true);
    setActiveDivision('ai-agent');
    setActiveZone('overview');
    viewportRef.current?.selectAgent(null, null, false);
    viewportRef.current?.setCameraPreset('overview');
  }, []);

  const handleCloseAgentRoster = useCallback(() => {
    setAgentRosterOpen(false);
    setSelectedSpecialistId(null);
    setActiveDivision('dashboard');
    viewportRef.current?.selectAgent(null, null, false);
  }, []);

  const handleCloseProviderSettings = useCallback(() => {
    setProviderSettingsOpen(false);
    setActiveDivision('dashboard');
  }, []);

  const handleSaveProviderConfig = useCallback(
    (next: ProviderConfig) => {
      setProviderConfig(next);
      try {
        window.localStorage.setItem(PROVIDER_CONFIG_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      if (firebaseUser) {
        void syncWorkspaceSettingsToFirestore(firebaseUser.uid, channelTemplates, next);
      }
      const routingLabel =
        next.llmRouting === 'auto'
          ? 'Otomatis (Ollama → Gemini)'
          : next.llmRouting === 'ollama'
          ? 'Ollama Lokal'
          : 'Gemini Cloud';
      setActivityLog((prev) =>
        appendActivityLog(prev, [
          createStudioActivityEntry(
            `Koneksi AI diperbarui · Routing: ${routingLabel} · Ollama: ${next.ollama.model}`
          ),
        ])
      );
    },
    [firebaseUser, channelTemplates]
  );

  const handleResetProviderConfig = useCallback(() => {
    const defaults = createDefaultProviderConfig();
    setProviderConfig(defaults);
    try {
      window.localStorage.setItem(PROVIDER_CONFIG_STORAGE_KEY, JSON.stringify(defaults));
    } catch {
      // Ignore storage quota errors
    }
    if (firebaseUser) {
      void syncWorkspaceSettingsToFirestore(firebaseUser.uid, channelTemplates, defaults);
    }
    setActivityLog((prev) =>
      appendActivityLog(prev, [
        createStudioActivityEntry('Pengaturan koneksi AI dikembalikan ke setelan awal'),
      ])
    );
  }, [firebaseUser, channelTemplates]);

  const handleOpenChannelTemplates = useCallback(() => {
    setFloorWorkflowFloorId(null);
    setFloorDashboardOpen(false);
    setControlsOpen(false);
    setProviderSettingsOpen(false);
    setAgentRosterOpen(false);
    setOrchestratorOpen(false);
    setDivisionToolMode(null);
    setMediaStudioOpen(false);
    setShortsFactoryOpen(true);
    setShortsFactoryTab('templates');
    setShortsFactoryTabNonce((n) => n + 1);
    setActiveDivision('channel-youtube');
    setActiveZone('kode');
    viewportRef.current?.setCameraPreset('kode');
  }, []);

  const handleVoiceSynthesisEvent = useCallback(
    (phase: 'start' | 'done' | 'error', label: string) => {
      const voiceTaskId = 'elevenlabs_tts_preview';
      const voiceIdentity = getFloorEmployeeIdentity(activeFloorId, 'voice-artist');
      if (phase === 'start') {
        viewportRef.current?.startAgentTask(activeFloorId, 'voice-artist', voiceTaskId, label);
      } else if (phase === 'done') {
        viewportRef.current?.finishAgentTask(activeFloorId, 'voice-artist', voiceTaskId, true);
        setActivityLog((prev) =>
          appendActivityLog(prev, [
            createStudioActivityEntry(
              `[L${activeFloorId}] ${voiceIdentity.name} menyelesaikan ${label}`
            ),
          ])
        );
      } else {
        viewportRef.current?.finishAgentTask(activeFloorId, 'voice-artist', voiceTaskId, false);
      }
    },
    [activeFloorId]
  );

  const handleSelectSpecialist = useCallback(
    (floorId: FloorId, specialist: SpecialistAgentProfile | null) => {
      setActiveFloorId(floorId);
      if (!specialist) {
        setSelectedSpecialistId(null);
        viewportRef.current?.selectAgent(null, null, false);
        return;
      }
      setSelectedSpecialistId(specialist.id);
      setActiveZone(specialist.officeZone);
      viewportRef.current?.selectAgent(floorId, specialist.id, true);
    },
    []
  );

  const handleOpenFloorDashboard = useCallback((targetFloor?: FloorId) => {
    if (targetFloor) {
      setFloorView(targetFloor);
      setActiveFloorId(targetFloor);
      viewportRef.current?.setFloorView(targetFloor);
    }
    setFloorWorkflowFloorId(null);
    setControlsOpen(false);
    setAgentRosterOpen(false);
    setProviderSettingsOpen(false);
    setOrchestratorOpen(false);
    setMediaStudioOpen(false);
    setShortsFactoryOpen(false);
    setDivisionToolMode(null);
    setSelectedTarget(null);
    setActiveDivision('performa-lantai');
    setFloorDashboardOpen(true);
    viewportRef.current?.selectAgent(null, null, false);
  }, []);

  const handleCloseFloorDashboard = useCallback(() => {
    setFloorDashboardOpen(false);
    setActiveDivision('dashboard');
  }, []);

  const handleOpenFloorWorkflow = useCallback((targetFloor: FloorId) => {
    setFloorView(targetFloor);
    setActiveFloorId(targetFloor);
    setFloorWorkflowFloorId(targetFloor);
    setFloorDashboardOpen(false);
    setControlsOpen(false);
    setAgentRosterOpen(false);
    setProviderSettingsOpen(false);
    setOrchestratorOpen(false);
    setMediaStudioOpen(false);
    setShortsFactoryOpen(false);
    setDivisionToolMode(null);
    setSelectedTarget(null);
    setActiveDivision(getDivisionIdFromFloor(targetFloor));
    setActiveZone('overview');
    viewportRef.current?.selectAgent(null, null, false);
    viewportRef.current?.setFloorView(targetFloor, 'overview');
  }, []);

  const handleCloseFloorWorkflow = useCallback(() => {
    setFloorWorkflowFloorId(null);
    setActiveDivision('dashboard');
  }, []);

  const handleOpenOrchestratorForFloor = useCallback(
    (targetFloor: FloorId, prefill?: Omit<OrchestratorPrefill, 'nonce'>) => {
      setFloorView(targetFloor);
      setActiveFloorId(targetFloor);
      setFloorWorkflowFloorId(null);
      setFloorDashboardOpen(false);
      setControlsOpen(false);
      setAgentRosterOpen(false);
      setProviderSettingsOpen(false);
      setMediaStudioOpen(false);
      setShortsFactoryOpen(false);
      setDivisionToolMode(null);
      setSelectedTarget(null);
      if (prefill) {
        setOrchestratorPrefill({ ...prefill, nonce: Date.now() });
      }
      setOrchestratorOpen(true);
      setActiveDivision('produksi-konten');
      setActiveZone('kode');
      viewportRef.current?.selectAgent(null, null, false);
      viewportRef.current?.setFloorView(targetFloor, 'kode');
    },
    []
  );

  const handleUploadMasterBibleFile = useCallback(
    async (file: File) => {
      setMasterBibleBusy(true);
      setMasterBibleError(null);
      setMasterBibleSyncNotice(null);
      try {
        const rawText = await file.text();
        const parsed = parseMasterBibleContent(rawText, file.name);
        await saveMasterBibleToIndexedDb(parsed);

        // Activate immediately in browser state across L1, L2 & L3
        setMasterBible(parsed);

        // 1. Primary cloud persistence: save chunked Master Alkitab directly to Firebase Firestore when signed in
        let savedToFirebase = false;
        let firebaseNotice: string | null = null;
        if (firebaseUser) {
          const fbRes = await syncMasterBibleToFirestore(firebaseUser.uid, parsed);
          if (fbRes.ok) {
            savedToFirebase = true;
            firebaseNotice = `Tersimpan di Firebase Firestore (${fbRes.chunkCount ?? 1} bagian) — otomatis sinkron di PC, Android & Netlify.`;
          } else if (fbRes.permissionDenied) {
            firebaseNotice =
              'Alkitab aktif di browser. Tambahkan aturan Firestore Rules untuk masterBible & masterBibleChunks (buka panel Firebase) agar tersimpan di Cloud.';
          } else {
            firebaseNotice = `Alkitab aktif di browser. Sinkronisasi Firebase tertunda (${fbRes.errorMessage || 'coba lagi'}).`;
          }
        }

        // 2. Non-blocking backend memory sync (for local/Cloud Run server AI agents)
        const backendOutcome = await syncMasterBibleToBackend(parsed);

        if (savedToFirebase) {
          setMasterBibleSyncMode('firebase-synced');
          setMasterBibleSyncNotice(firebaseNotice);
        } else {
          setMasterBibleSyncMode(backendOutcome.mode);
          setMasterBibleSyncNotice(
            firebaseNotice ??
              (firebaseUser
                ? backendOutcome.notice
                : 'Alkitab aktif di browser (IndexedDB). Masuk ke akun Firebase agar Alkitab otomatis tersimpan di Cloud Firestore.')
          );
        }

        setActivityLog((prev) =>
          appendActivityLog(prev, [
            createStudioActivityEntry(
              `Master Alkitab TB diunggah & aktif di L1, L2 & L3: ${parsed.report.sourceName} (${parsed.report.bookCount} kitab · ${parsed.report.indexedVerseCount.toLocaleString('id-ID')} ayat${savedToFirebase ? ' · Tersimpan di Firebase' : ''})`
            ),
          ])
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Gagal membaca file Alkitab Terjemahan Baru.';
        setMasterBibleError(msg);
      } finally {
        setMasterBibleBusy(false);
      }
    },
    [firebaseUser]
  );

  const handleClearMasterBible = useCallback(async () => {
    setMasterBibleBusy(true);
    setMasterBibleError(null);
    setMasterBibleSyncNotice(null);
    try {
      await clearMasterBibleFromIndexedDb();
      if (firebaseUser) {
        await deleteMasterBibleFromFirestore(firebaseUser.uid).catch(() => undefined);
      }
      await fetch('/api/bible/master', { method: 'DELETE' }).catch(() => undefined);
      setMasterBible(null);
      setMasterBibleSyncMode('server-synced');
      setActivityLog((prev) =>
        appendActivityLog(prev, [
          createStudioActivityEntry(
            `Master Alkitab Terjemahan Baru dihapus dari memori lokal${firebaseUser ? ', Firebase Cloud' : ''} & server`
          ),
        ])
      );
    } catch (err) {
      setMasterBibleError(
        err instanceof Error ? err.message : 'Gagal menghapus Master Alkitab.'
      );
    } finally {
      setMasterBibleBusy(false);
    }
  }, [firebaseUser]);

  const handleDevotionalResearchEvent = useCallback(
    (phase: 'start' | 'done' | 'error', detail: string) => {
      const taskId = 'l1_devotional_research';
      if (phase === 'start') {
        viewportRef.current?.startAgentTask(1, 'trend-researcher', `${taskId}_t`, detail);
        viewportRef.current?.startAgentTask(1, 'bible-researcher', `${taskId}_b`, detail);
        setActivityLog((prev) =>
          appendActivityLog(prev, [
            createStudioActivityEntry(`[L1] Riset Renungan Valid dimulai: ${detail}`),
          ])
        );
      } else if (phase === 'done') {
        viewportRef.current?.finishAgentTask(1, 'trend-researcher', `${taskId}_t`, true);
        viewportRef.current?.finishAgentTask(1, 'bible-researcher', `${taskId}_b`, true);
        setActivityLog((prev) =>
          appendActivityLog(prev, [
            createStudioActivityEntry(`[L1] Renungan harian valid siap (2m 50d): ${detail}`),
          ])
        );
      } else {
        viewportRef.current?.finishAgentTask(1, 'trend-researcher', `${taskId}_t`, false);
        viewportRef.current?.finishAgentTask(1, 'bible-researcher', `${taskId}_b`, false);
      }
    },
    []
  );

  const handleCloseControls = useCallback(() => {
    setControlsOpen(false);
    setActiveDivision('dashboard');
  }, []);

  const handleToggleMediaStudio = useCallback(() => {
    setMediaStudioOpen((prev) => {
      const next = !prev;
      if (next) {
        setFloorWorkflowFloorId(null);
        setFloorDashboardOpen(false);
        setControlsOpen(false);
        setAgentRosterOpen(false);
        setProviderSettingsOpen(false);
        setOrchestratorOpen(false);
        setShortsFactoryOpen(false);
        setDivisionToolMode(null);
        setSelectedTarget(null);
        setActiveDivision('video-editor');
        viewportRef.current?.selectAgent(null, null, false);
      } else {
        setActiveDivision('dashboard');
      }
      return next;
    });
  }, []);

  const handleToggleShortsFactory = useCallback(() => {
    setShortsFactoryOpen((prev) => {
      const next = !prev;
      if (next) {
        setFloorWorkflowFloorId(null);
        setFloorDashboardOpen(false);
        setControlsOpen(false);
        setAgentRosterOpen(false);
        setProviderSettingsOpen(false);
        setOrchestratorOpen(false);
        setMediaStudioOpen(false);
        setDivisionToolMode(null);
        setSelectedTarget(null);
        setActiveDivision('channel-youtube');
        viewportRef.current?.selectAgent(null, null, false);
      } else {
        setActiveDivision('dashboard');
      }
      return next;
    });
  }, []);

  const handleToggleOrchestrator = useCallback(() => {
    setOrchestratorOpen((prev) => {
      const next = !prev;
      if (next) {
        setFloorWorkflowFloorId(null);
        setFloorDashboardOpen(false);
        setControlsOpen(false);
        setAgentRosterOpen(false);
        setProviderSettingsOpen(false);
        setMediaStudioOpen(false);
        setShortsFactoryOpen(false);
        setDivisionToolMode(null);
        setSelectedTarget(null);
        setActiveDivision('produksi-konten');
        setActiveZone('kode');
        viewportRef.current?.selectAgent(null, null, false);
        viewportRef.current?.setCameraPreset('kode');
      } else {
        setActiveDivision('dashboard');
      }
      return next;
    });
  }, []);

  const handleOpenProviderSettingsFromOrchestrator = useCallback(() => {
    setFloorWorkflowFloorId(null);
    setOrchestratorOpen(false);
    setControlsOpen(false);
    setFloorDashboardOpen(false);
    setAgentRosterOpen(false);
    setDivisionToolMode(null);
    setShortsFactoryOpen(false);
    setMediaStudioOpen(false);
    setSelectedTarget(null);
    setProviderSettingsOpen(true);
    setActiveDivision('pengaturan');
  }, []);

  const handleOrchestratorStageEvent = useCallback((ev: OrchestratorStageEvent) => {
    const floorCfg = getFloorByChannelId(ev.channelId);
    const floorId = floorCfg.floorId;
    const taskId = `pipeline_${ev.stageId}_${ev.agentId}`;
    const identity = getFloorEmployeeIdentity(floorId, ev.agentId);

    if (ev.phase === 'start') {
      viewportRef.current?.startAgentTask(floorId, ev.agentId, taskId, ev.stageTitle);
      setActivityLog((prev) =>
        appendActivityLog(prev, [
          createStudioActivityEntry(
            `[L${floorId}] Orkestrator · ${identity.name} memulai "${ev.stageTitle}"${ev.detail ? ` (${ev.detail})` : ''}`
          ),
        ])
      );
    } else if (ev.phase === 'done') {
      viewportRef.current?.finishAgentTask(floorId, ev.agentId, taskId, true);
      setActivityLog((prev) =>
        appendActivityLog(prev, [
          createStudioActivityEntry(
            `[L${floorId}] Orkestrator · ${identity.name} menyelesaikan "${ev.stageTitle}"${ev.detail ? ` — ${ev.detail}` : ''}`
          ),
        ])
      );
    } else {
      viewportRef.current?.finishAgentTask(floorId, ev.agentId, taskId, false);
      setActivityLog((prev) =>
        appendActivityLog(prev, [
          createStudioActivityEntry(
            `[L${floorId}] Orkestrator · "${ev.stageTitle}" terkendala${ev.detail ? `: ${ev.detail}` : ''}`
          ),
        ])
      );
    }
  }, []);

  const handleCloseDivisionTool = useCallback(() => {
    setDivisionToolMode(null);
    setActiveDivision('dashboard');
  }, []);

  const handleUpdateScheduleSlot = useCallback(
    (slotId: string, patch: Partial<Pick<PublicationSlot, 'channelId' | 'queueItemId'>>) => {
      setWeeklySchedule((prev) =>
        prev.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot))
      );
    },
    []
  );

  const handleSendClipToProduction = useCallback(
    (payload: {
      channelId: ShortsChannelId;
      title: string;
      bibleReference: string;
      durationSeconds: ShortsDuration;
      notes: string;
    }) => {
      const targetFloor = getFloorByChannelId(payload.channelId).floorId;
      setActiveFloorId(targetFloor);
      setShortsBriefPrefill({ ...payload, nonce: Date.now() });
      setDivisionToolMode(null);
      setOrchestratorOpen(false);
      setMediaStudioOpen(false);
      setShortsFactoryOpen(true);
      setShortsFactoryTab('produksi');
      setShortsFactoryTabNonce((n) => n + 1);
      setActiveDivision('produksi-konten');
      setActiveZone('kode');
      viewportRef.current?.setCameraPreset('kode');
    },
    []
  );

  const handleUpsertShortsQueueItem = useCallback(
    (item: ShortsQueueItem) => {
      setShortsQueue((prev) => {
        const exists = prev.some((q) => q.id === item.id);
        if (exists) {
          return prev.map((q) => (q.id === item.id ? item : q));
        }
        return [item, ...prev];
      });
      if (firebaseUser) {
        void syncShortsQueueItemToFirestore(firebaseUser.uid, item);
      }
    },
    [firebaseUser]
  );

  const handleUpdateShortsQueueStage = useCallback(
    (id: string, stage: QueueStage) => {
      const updatedAt = new Date().toISOString();
      setShortsQueue((prev) =>
        prev.map((q) => {
          if (q.id !== id) return q;
          const nextItem = { ...q, stage, updatedAt };
          if (firebaseUser) {
            void syncShortsQueueItemToFirestore(firebaseUser.uid, nextItem);
          }
          return nextItem;
        })
      );
    },
    [firebaseUser]
  );

  const handleSaveChannelTemplate = useCallback(
    (template: ChannelTemplateConfig) => {
      setChannelTemplates((prev) => {
        const next: ChannelTemplatesMap = {
          ...prev,
          [template.channelId]: template,
        };
        try {
          window.localStorage.setItem(CHANNEL_TEMPLATES_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage quota errors cleanly
        }
        if (firebaseUser) {
          void syncWorkspaceSettingsToFirestore(firebaseUser.uid, next, providerConfig);
        }
        return next;
      });
      const ch = getChannelById(template.channelId);
      setActivityLog((prev) =>
        appendActivityLog(prev, [
          createStudioActivityEntry(
            `Template ${ch.name} diperbarui (${template.defaultDuration} detik)`
          ),
        ])
      );
    },
    [firebaseUser, providerConfig]
  );

  const handleResetChannelTemplate = useCallback(
    (channelId: ShortsChannelId) => {
      const defaults = createDefaultChannelTemplates();
      setChannelTemplates((prev) => {
        const next: ChannelTemplatesMap = {
          ...prev,
          [channelId]: defaults[channelId],
        };
        try {
          window.localStorage.setItem(CHANNEL_TEMPLATES_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage quota errors cleanly
        }
        if (firebaseUser) {
          void syncWorkspaceSettingsToFirestore(firebaseUser.uid, next, providerConfig);
        }
        return next;
      });
      const ch = getChannelById(channelId);
      setActivityLog((prev) =>
        appendActivityLog(prev, [
          createStudioActivityEntry(`Template ${ch.name} dikembalikan ke setelan awal`),
        ])
      );
    },
    [firebaseUser, providerConfig]
  );

  const handleShortsProductionEvent = useCallback(
    (ev: ShortsProductionEvent) => {
      const floorId: FloorId = ev.channelName.toLowerCase().includes('stories')
        ? 2
        : ev.channelName.toLowerCase().includes('facts')
        ? 3
        : ev.channelName.toLowerCase().includes('faith')
        ? 1
        : activeFloorId;
      const taskId = `shorts_${Date.now()}`;
      if (ev.phase === 'start') {
        viewportRef.current?.startAgentTask(floorId, 'bible-researcher', `${taskId}_b`, `Riset Alkitab: ${ev.title}`);
        viewportRef.current?.startAgentTask(floorId, 'scriptwriter', `${taskId}_s`, `Naskah Shorts: ${ev.title}`);
        viewportRef.current?.startAgentTask(floorId, 'storyboard-artist', `${taskId}_v`, `Storyboard 9:16: ${ev.title}`);
        viewportRef.current?.startAgentTask(floorId, 'theological-guardian', `${taskId}_g`, `Audit Guardian: ${ev.title}`);
        setActivityLog((prev) =>
          appendActivityLog(prev, [
            createStudioActivityEntry(
              `[L${floorId}] Pabrik Shorts memulai produksi "${ev.title}" (${ev.channelName})`
            ),
          ])
        );
      } else if (ev.phase === 'done') {
        viewportRef.current?.finishAgentTask(floorId, 'bible-researcher', `${taskId}_b`, true);
        viewportRef.current?.finishAgentTask(floorId, 'scriptwriter', `${taskId}_s`, true);
        viewportRef.current?.finishAgentTask(floorId, 'storyboard-artist', `${taskId}_v`, true);
        viewportRef.current?.finishAgentTask(floorId, 'theological-guardian', `${taskId}_g`, true);
        setActivityLog((prev) =>
          appendActivityLog(prev, [
            createStudioActivityEntry(
              `[L${floorId}] Pabrik Shorts selesai (${ev.guardianStatus ?? 'LULUS'}): "${ev.title}"`
            ),
          ])
        );
      } else {
        viewportRef.current?.finishAgentTask(floorId, 'bible-researcher', `${taskId}_b`, false);
        viewportRef.current?.finishAgentTask(floorId, 'scriptwriter', `${taskId}_s`, false);
        viewportRef.current?.finishAgentTask(floorId, 'storyboard-artist', `${taskId}_v`, false);
        viewportRef.current?.finishAgentTask(floorId, 'theological-guardian', `${taskId}_g`, false);
      }
    },
    [activeFloorId]
  );

  const handleHandoffToMediaStudio = useCallback(
    (payload: { tab: 'video' | 'image'; prompt: string; aspect: '9:16' }) => {
      setMediaStudioPrefill({
        tab: payload.tab,
        prompt: payload.prompt,
        videoAspect: payload.tab === 'video' ? payload.aspect : undefined,
        imageAspect: payload.tab === 'image' ? payload.aspect : undefined,
        nonce: Date.now(),
      });
      setShortsFactoryOpen(false);
      setOrchestratorOpen(false);
      setControlsOpen(false);
      setFloorDashboardOpen(false);
      setMediaStudioOpen(true);
    },
    []
  );

  const handleMediaCreated = useCallback((item: GeneratedMediaItem) => {
    setMediaItems((prev) => [item, ...prev].slice(0, 12));
    const msg =
      item.kind === 'video'
        ? `Studio Media membuat video ${item.aspectRatio} baru`
        : item.mode === 'edit'
        ? `Studio Media menyelesaikan edit gambar ${item.aspectRatio}`
        : `Studio Media membuat karya gambar ${item.aspectRatio} baru`;
    setActivityLog((prev) => appendActivityLog(prev, [createStudioActivityEntry(msg)]));
  }, []);

  const handleProjectVideo = useCallback(
    (item: GeneratedMediaItem | null) => {
      if (!item) {
        setProjectedVideoId(null);
        viewportRef.current?.projectVideoToOffice(null, '16:9', false, activeFloorId);
        setActivityLog((prev) =>
          appendActivityLog(prev, [
            createStudioActivityEntry(
              `[L${activeFloorId}] Studio Media mengatur ulang Layar Rapat 3D`
            ),
          ])
        );
        return;
      }
      const aspect: VideoAspectRatio = item.aspectRatio === '9:16' ? '9:16' : '16:9';
      setProjectedVideoId(item.id);
      setActiveZone('rapat');
      viewportRef.current?.projectVideoToOffice(item.dataUrl, aspect, true, activeFloorId);
      setActivityLog((prev) =>
        appendActivityLog(prev, [
          createStudioActivityEntry(
            `[L${activeFloorId}] Studio Media memproyeksikan video ${aspect} ke Layar Rapat 3D`
          ),
        ])
      );
    },
    [activeFloorId]
  );

  const handleMountGalleryImage = useCallback(
    (dataUrl: string | null, label = 'Karya Visual') => {
      setMountedImageUrl(dataUrl);
      if (!dataUrl) {
        viewportRef.current?.displayImageInOffice(null, false, activeFloorId);
        setActivityLog((prev) =>
          appendActivityLog(prev, [
            createStudioActivityEntry(
              `[L${activeFloorId}] Studio Media mengatur ulang Bingkai Galeri 3D`
            ),
          ])
        );
        return;
      }
      setActiveZone('kode');
      viewportRef.current?.displayImageInOffice(dataUrl, true, activeFloorId);
      setActivityLog((prev) =>
        appendActivityLog(prev, [
          createStudioActivityEntry(
            `[L${activeFloorId}] Studio Media memasang ${label} di Galeri Dinding 3D`
          ),
        ])
      );
    },
    [activeFloorId]
  );

  const handleRunCommand = useCallback(
    (command: OfficeCommand) => {
      viewportRef.current?.runOfficeCommand(command, floorView);
      if (command === 'standup') {
        setActiveZone('rapat');
        setSelectedTarget(null);
        viewportRef.current?.selectAgent(null, null, false);
        viewportRef.current?.setCameraPreset('rapat');
      } else if (command === 'coffee_break') {
        setActiveZone('lounge');
        setSelectedTarget(null);
        viewportRef.current?.selectAgent(null, null, false);
        viewportRef.current?.setCameraPreset('lounge');
      } else {
        setActiveZone('overview');
        setSelectedTarget(null);
        viewportRef.current?.selectAgent(null, null, false);
        viewportRef.current?.setCameraPreset('overview');
      }
    },
    [floorView]
  );

  const handleRunFloorCommand = useCallback((floorId: FloorId, command: OfficeCommand) => {
    setFloorView(floorId);
    setActiveFloorId(floorId);
    viewportRef.current?.runOfficeCommand(command, floorId);
    const targetZone: OfficeZoneId =
      command === 'standup' ? 'rapat' : command === 'coffee_break' ? 'lounge' : 'overview';
    setActiveZone(targetZone);
    viewportRef.current?.setFloorView(floorId, targetZone);
    const cmdLabel =
      command === 'standup' ? 'Rapat Tim' : command === 'coffee_break' ? 'Rehat Kopi' : 'Meja Kerja';
    const floorCfg = BUILDING_FLOORS[floorId];
    setActivityLog((prev) =>
      appendActivityLog(prev, [
        createStudioActivityEntry(
          `[L${floorId}] Perintah "${cmdLabel}" dijalankan khusus ${floorCfg.channelName}`
        ),
      ])
    );
  }, []);

  const handleSubmitAgentTask = useCallback(
    async (floorId: FloorId, agentId: AgentId, prompt: string) => {
      const floorCfg = BUILDING_FLOORS[floorId];
      const floorKey = makeFloorAgentKey(floorId, agentId);
      const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newEntry: TaskEntry = {
        id: taskId,
        agentId,
        prompt,
        status: 'running',
        createdAt: new Date().toISOString(),
      };

      setTasksByFloorAgent((prev) => ({
        ...prev,
        [floorKey]: [newEntry, ...(prev[floorKey] ?? [])],
      }));

      viewportRef.current?.startAgentTask(floorId, agentId, taskId, prompt);

      // Browser-direct Ollama path (allows Cloud preview to call user's PC localhost Ollama with CORS enabled)
      const useBrowserOllama =
        providerConfig.ollama.enabled &&
        providerConfig.ollama.connectionMode === 'browser' &&
        providerConfig.llmRouting !== 'gemini';

      if (useBrowserOllama) {
        const specialist = getSpecialistById(agentId);
        const identity = getFloorEmployeeIdentity(floorId, agentId);
        const baseInstruction = specialist
          ? `Kamu adalah ${identity.name}, menjabat sebagai ${specialist.roleTitle} (${specialist.jobTitleId}) di ${floorCfg.label} (${floorCfg.channelName}) pada Menara Kantor AI 3D. Fokus kerjamu: ${specialist.summary}. Jawab dalam Bahasa Indonesia yang ringkas dan siap eksekusi (maksimal 120 kata).`
          : `Kamu adalah agen AI di ${floorCfg.label} (${floorCfg.channelName}). Jawab ringkas dalam Bahasa Indonesia.`;
        const systemInstruction = `${baseInstruction}\n\n${buildMasterBibleSystemPolicy(
          masterBible,
          prompt
        )}`;

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 30000);
          const ollamaRes = await fetch(`${providerConfig.ollama.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: providerConfig.ollama.model,
              stream: false,
              messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: prompt },
              ],
            }),
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (ollamaRes.ok) {
            const ollamaData = (await ollamaRes.json()) as {
              message?: { content?: string };
              response?: string;
            };
            const text = (ollamaData.message?.content ?? ollamaData.response ?? '').trim();
            if (text) {
              const completedOllamaEntry: TaskEntry = {
                ...newEntry,
                status: 'completed',
                output: `[Lantai ${floorId} · Ollama Lokal · ${providerConfig.ollama.model}]\n${text}`,
                completedAt: new Date().toISOString(),
              };
              setTasksByFloorAgent((prev) => ({
                ...prev,
                [floorKey]: (prev[floorKey] ?? []).map((t) =>
                  t.id === taskId ? completedOllamaEntry : t
                ),
              }));
              if (firebaseUser) {
                void syncAgentTaskToFirestore(firebaseUser.uid, completedOllamaEntry);
              }
              viewportRef.current?.finishAgentTask(floorId, agentId, taskId, true);
              return;
            }
          }
          if (providerConfig.llmRouting === 'ollama') {
            throw new Error(`Ollama browser-direct HTTP ${ollamaRes.status}`);
          }
        } catch {
          if (providerConfig.llmRouting === 'ollama') {
            const errMessage = `Gagal terhubung ke Ollama lokal (${providerConfig.ollama.baseUrl}) dari browser. Pastikan "OLLAMA_ORIGINS=*" aktif atau ganti routing ke Otomatis.`;
            setTasksByFloorAgent((prev) => ({
              ...prev,
              [floorKey]: (prev[floorKey] ?? []).map((t) =>
                t.id === taskId ? { ...t, status: 'error', error: errMessage } : t
              ),
            }));
            viewportRef.current?.finishAgentTask(floorId, agentId, taskId, false);
            return;
          }
          // Fall through cleanly to Gemini Cloud on server when llmRouting === 'auto'
        }
      }

      try {
        const serverProviderPayload: ProviderConfig = useBrowserOllama
          ? { ...providerConfig, llmRouting: 'gemini' }
          : providerConfig;

        const response = await fetch('/api/agent-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            floorId,
            channelId: getChannelIdByFloor(floorId),
            agentId,
            task: prompt,
            providerConfig: serverProviderPayload,
          }),
        });

        const data = (await response.json()) as {
          output?: string;
          providerUsed?: string;
          modelUsed?: string;
          keySlotUsed?: string;
          completedAt?: string;
          error?: string;
        };

        if (!response.ok || !data.output) {
          const errMessage = data.error || 'Gagal mendapatkan respons dari agen AI.';
          setTasksByFloorAgent((prev) => ({
            ...prev,
            [floorKey]: (prev[floorKey] ?? []).map((t) =>
              t.id === taskId ? { ...t, status: 'error', error: errMessage } : t
            ),
          }));
          viewportRef.current?.finishAgentTask(floorId, agentId, taskId, false);
          return;
        }

        const sourcePrefix =
          data.providerUsed === 'ollama' && data.modelUsed
            ? `[Lantai ${floorId} · Ollama · ${data.modelUsed}]\n`
            : data.keySlotUsed
            ? `[Lantai ${floorId} · ${floorCfg.channelName} · ${data.keySlotUsed}]\n`
            : '';

        const completedEntry: TaskEntry = {
          ...newEntry,
          status: 'completed',
          output: `${sourcePrefix}${data.output}`,
          completedAt: data.completedAt ?? new Date().toISOString(),
        };
        setTasksByFloorAgent((prev) => ({
          ...prev,
          [floorKey]: (prev[floorKey] ?? []).map((t) => (t.id === taskId ? completedEntry : t)),
        }));
        if (firebaseUser) {
          void syncAgentTaskToFirestore(firebaseUser.uid, completedEntry);
        }
        viewportRef.current?.finishAgentTask(floorId, agentId, taskId, true);
      } catch {
        const errMessage = 'Koneksi ke server tugas agen AI terputus.';
        setTasksByFloorAgent((prev) => ({
          ...prev,
          [floorKey]: (prev[floorKey] ?? []).map((t) =>
            t.id === taskId ? { ...t, status: 'error', error: errMessage } : t
          ),
        }));
        viewportRef.current?.finishAgentTask(floorId, agentId, taskId, false);
      }
    },
    [providerConfig, firebaseUser, masterBible]
  );

  const handleSubmitSpecialistTask = useCallback(
    async (floorId: FloorId, specialist: SpecialistAgentProfile, prompt: string) => {
      await handleSubmitAgentTask(floorId, specialist.id, prompt);
    },
    [handleSubmitAgentTask]
  );

  // Keyboard shortcuts: H toggles dock, Escape closes drawers, 1-6 camera presets
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.key === 'Escape') {
        setFirebaseModalOpen(false);
        setFloorWorkflowFloorId(null);
        setFloorDashboardOpen(false);
        setControlsOpen(false);
        setAgentRosterOpen(false);
        setProviderSettingsOpen(false);
        setOrchestratorOpen(false);
        setSelectedSpecialistId(null);
        setSelectedTarget(null);
        setMediaStudioOpen(false);
        setShortsFactoryOpen(false);
        setDivisionToolMode(null);
        setActiveDivision('dashboard');
        viewportRef.current?.selectAgent(null, null, false);
      } else if (e.key >= '1' && e.key <= '6') {
        const idx = Number(e.key) - 1;
        const zone = CAMERA_PRESET_ORDER[idx];
        if (zone) handleSelectZone(zone);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSelectZone]);

  return (
    <main
      className="relative h-full w-full overflow-hidden"
      data-office-mode={buildingState.floors[activeFloorId].officeMode}
      data-floor-view={String(floorView)}
      data-active-floor={String(activeFloorId)}
      data-total-employees={String(TOTAL_BUILDING_EMPLOYEES)}
      data-active-division={activeDivision}
      data-lighting={lighting}
      data-selected-agent={
        selectedTarget
          ? makeFloorAgentKey(selectedTarget.floorId, selectedTarget.agentId)
          : 'none'
      }
      data-controls-open={String(controlsOpen)}
      data-floor-dashboard-open={String(floorDashboardOpen)}
      data-floor-workflow-floor={floorWorkflowFloorId ? String(floorWorkflowFloorId) : 'none'}
      data-media-studio-open={String(mediaStudioOpen)}
      data-shorts-factory-open={String(shortsFactoryOpen)}
      data-orchestrator-open={String(orchestratorOpen)}
      data-master-bible-loaded={String(Boolean(masterBible))}
      data-completed-tasks={String(buildingState.completedTaskCount)}
    >
      <OfficeViewport
        ref={viewportRef}
        onStateSnapshot={handleStateSnapshot}
        onAgentClicked={handleAgentClicked}
      />

      <OfficeHUD
        buildingState={buildingState}
        floorView={floorView}
        activeFloorId={activeFloorId}
        activityLog={activityLog}
        activeZone={activeZone}
        activeDivision={activeDivision}
        sidebarCollapsed={sidebarCollapsed}
        lighting={lighting}
        simSpeed={simSpeed}
        selectedTarget={selectedTarget}
        tasksByFloorAgent={tasksByFloorAgent}
        mediaStudioOpen={mediaStudioOpen}
        mediaStudioPrefill={mediaStudioPrefill}
        mediaItems={mediaItems}
        projectedVideoId={projectedVideoId}
        mountedImageUrl={mountedImageUrl}
        shortsFactoryOpen={shortsFactoryOpen}
        shortsFactoryTab={shortsFactoryTab}
        shortsFactoryTabNonce={shortsFactoryTabNonce}
        shortsBriefPrefill={shortsBriefPrefill}
        shortsQueue={shortsQueue}
        channelTemplates={channelTemplates}
        divisionToolMode={divisionToolMode}
        weeklySchedule={weeklySchedule}
        agentRosterOpen={agentRosterOpen}
        providerSettingsOpen={providerSettingsOpen}
        orchestratorOpen={orchestratorOpen}
        floorDashboardOpen={floorDashboardOpen}
        floorWorkflowFloorId={floorWorkflowFloorId}
        controlsOpen={controlsOpen}
        providerConfig={providerConfig}
        selectedSpecialistId={selectedSpecialistId}
        masterBible={masterBible}
        masterBibleBusy={masterBibleBusy}
        masterBibleError={masterBibleError}
        masterBibleSyncMode={masterBibleSyncMode}
        masterBibleSyncNotice={masterBibleSyncNotice}
        orchestratorPrefill={orchestratorPrefill}
        firebaseUser={firebaseUser}
        firebaseAuthLoading={firebaseAuthLoading}
        firebaseSyncStatus={firebaseSyncStatus}
        firebaseModalOpen={firebaseModalOpen}
        setupGuideOpen={setupGuideOpen}
        onSelectFloorView={handleSelectFloorView}
        onSelectZone={handleSelectZone}
        onSelectDivision={handleSelectDivision}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
        onOpenFirebaseAuth={() => setFirebaseModalOpen(true)}
        onCloseFirebaseAuth={() => setFirebaseModalOpen(false)}
        onOpenSetupGuide={handleOpenSetupGuide}
        onCloseSetupGuide={handleCloseSetupGuide}
        onSyncFirebaseNow={handleSyncFirebaseNow}
        onSelectLighting={handleSelectLighting}
        onSelectSpeed={handleSelectSpeed}
        onSelectAgent={handleSelectAgent}
        onOpenAgentRoster={handleOpenAgentRoster}
        onCloseAgentRoster={handleCloseAgentRoster}
        onCloseProviderSettings={handleCloseProviderSettings}
        onSaveProviderConfig={handleSaveProviderConfig}
        onResetProviderConfig={handleResetProviderConfig}
        onOpenChannelTemplates={handleOpenChannelTemplates}
        onVoiceSynthesisEvent={handleVoiceSynthesisEvent}
        onSelectSpecialist={handleSelectSpecialist}
        onSubmitSpecialistTask={handleSubmitSpecialistTask}
        onRunCommand={handleRunCommand}
        onRunFloorCommand={handleRunFloorCommand}
        onOpenFloorDashboard={handleOpenFloorDashboard}
        onCloseFloorDashboard={handleCloseFloorDashboard}
        onOpenFloorWorkflow={handleOpenFloorWorkflow}
        onCloseFloorWorkflow={handleCloseFloorWorkflow}
        onOpenOrchestratorForFloor={handleOpenOrchestratorForFloor}
        onUploadMasterBibleFile={handleUploadMasterBibleFile}
        onClearMasterBible={handleClearMasterBible}
        onDevotionalResearchEvent={handleDevotionalResearchEvent}
        onCloseControls={handleCloseControls}
        onToggleMediaStudio={handleToggleMediaStudio}
        onToggleShortsFactory={handleToggleShortsFactory}
        onToggleOrchestrator={handleToggleOrchestrator}
        onOpenProviderSettingsFromOrchestrator={handleOpenProviderSettingsFromOrchestrator}
        onOrchestratorStageEvent={handleOrchestratorStageEvent}
        onCloseDivisionTool={handleCloseDivisionTool}
        onMediaCreated={handleMediaCreated}
        onProjectVideo={handleProjectVideo}
        onMountGalleryImage={handleMountGalleryImage}
        onSubmitAgentTask={handleSubmitAgentTask}
        onUpsertShortsQueueItem={handleUpsertShortsQueueItem}
        onUpdateShortsQueueStage={handleUpdateShortsQueueStage}
        onSaveChannelTemplate={handleSaveChannelTemplate}
        onResetChannelTemplate={handleResetChannelTemplate}
        onUpdateScheduleSlot={handleUpdateScheduleSlot}
        onSendClipToProduction={handleSendClipToProduction}
        onShortsProductionEvent={handleShortsProductionEvent}
        onHandoffToMediaStudio={handleHandoffToMediaStudio}
      />
    </main>
  );
}
