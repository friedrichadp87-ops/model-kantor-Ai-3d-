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
import {
  appendActivityLog,
  createInitialActivityLog,
  diffAgentActivityEvents,
  type ActivityLogEntry,
} from './office/activityLog';
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
  type QueueStage,
  type ShortsChannelId,
  type ShortsDuration,
  type ShortsQueueItem,
} from './office/shortsFactory';
import {
  createDefaultWeeklySchedule,
  getDivisionById,
  type PublicationSlot,
  type WorkspaceDivisionId,
} from './office/workspaceDivisions';
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
import { createInitialSimulationState } from './office/simulation';
import type {
  AgentId,
  LightingPreset,
  OfficeCommand,
  OfficeSimulationState,
  OfficeZoneId,
  TaskEntry,
} from './office/types';

function createInitialTasksMap(): Record<AgentId, TaskEntry[]> {
  const map = {} as Record<AgentId, TaskEntry[]>;
  for (const id of AGENT_ORDER) {
    map[id] = [];
  }
  return map;
}

export default function App() {
  const viewportRef = useRef<OfficeViewportHandle | null>(null);

  const initialSim = useRef<OfficeSimulationState | null>(null);
  if (!initialSim.current) {
    initialSim.current = createInitialSimulationState();
  }
  const prevSimStateRef = useRef<OfficeSimulationState>(initialSim.current);

  const [simState, setSimState] = useState<OfficeSimulationState>(initialSim.current);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(() =>
    createInitialActivityLog(initialSim.current!)
  );
  const [activeZone, setActiveZone] = useState<OfficeZoneId>('overview');
  const [activeDivision, setActiveDivision] = useState<WorkspaceDivisionId>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [lighting, setLighting] = useState<LightingPreset>('pagi');
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
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
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<SpecialistAgentId | null>(null);
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
  const [tasksByAgent, setTasksByAgent] = useState<Record<AgentId, TaskEntry[]>>(
    createInitialTasksMap
  );

  const handleStateSnapshot = useCallback((next: OfficeSimulationState) => {
    const incoming = diffAgentActivityEvents(prevSimStateRef.current, next);
    prevSimStateRef.current = next;
    setSimState(next);
    if (incoming.length > 0) {
      setActivityLog((prev) => appendActivityLog(prev, incoming));
    }
  }, []);

  const handleAgentClicked = useCallback((agentId: AgentId) => {
    setAgentRosterOpen(false);
    setProviderSettingsOpen(false);
    setMediaStudioOpen(false);
    setShortsFactoryOpen(false);
    setDivisionToolMode(null);
    setActiveDivision('ai-agent');
    setSelectedAgentId(agentId);
    setDockCollapsed(false);
  }, []);

  const handleSelectZone = useCallback((zone: OfficeZoneId) => {
    setActiveZone(zone);
    setSelectedAgentId(null);
    viewportRef.current?.selectAgent(null, false);
    viewportRef.current?.setCameraPreset(zone);
  }, []);

  const handleSelectDivision = useCallback((divisionId: WorkspaceDivisionId) => {
    const div = getDivisionById(divisionId);
    setActiveDivision(divisionId);
    setActiveZone(div.cameraZone);
    setDockCollapsed(false);

    if (divisionId === 'dashboard') {
      setAgentRosterOpen(false);
      setProviderSettingsOpen(false);
      setDivisionToolMode(null);
      setShortsFactoryOpen(false);
      setMediaStudioOpen(false);
      setSelectedAgentId(null);
      viewportRef.current?.selectAgent(null, false);
      viewportRef.current?.setCameraPreset('overview');
      return;
    }

    if (divisionId === 'ai-agent') {
      setProviderSettingsOpen(false);
      setDivisionToolMode(null);
      setShortsFactoryOpen(false);
      setMediaStudioOpen(false);
      setSelectedAgentId(null);
      setAgentRosterOpen(true);
      viewportRef.current?.selectAgent(null, false);
      viewportRef.current?.setCameraPreset('overview');
      return;
    }

    if (divisionId === 'pengaturan') {
      setAgentRosterOpen(false);
      setDivisionToolMode(null);
      setShortsFactoryOpen(false);
      setMediaStudioOpen(false);
      setSelectedAgentId(null);
      setProviderSettingsOpen(true);
      viewportRef.current?.selectAgent(null, false);
      viewportRef.current?.setCameraPreset(div.cameraZone);
      return;
    }

    setAgentRosterOpen(false);
    setProviderSettingsOpen(false);
    setSelectedAgentId(null);
    viewportRef.current?.selectAgent(null, false);
    viewportRef.current?.setCameraPreset(div.cameraZone);

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

    // Remaining divisions route cleanly into ShortsFactoryDrawer tabs
    setDivisionToolMode(null);
    setMediaStudioOpen(false);
    setShortsFactoryOpen(true);
    const tabByDivision: Record<string, FactoryTab> = {
      'produksi-konten': 'produksi',
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

  const handleSelectAgent = useCallback((agentId: AgentId | null) => {
    if (agentId) {
      setAgentRosterOpen(false);
      setProviderSettingsOpen(false);
      setMediaStudioOpen(false);
      setShortsFactoryOpen(false);
      setDivisionToolMode(null);
      setActiveDivision('ai-agent');
    }
    setSelectedAgentId(agentId);
    viewportRef.current?.selectAgent(agentId, Boolean(agentId));
  }, []);

  const handleOpenAgentRoster = useCallback(() => {
    setSelectedAgentId(null);
    setProviderSettingsOpen(false);
    setMediaStudioOpen(false);
    setShortsFactoryOpen(false);
    setDivisionToolMode(null);
    setAgentRosterOpen(true);
    setActiveDivision('ai-agent');
    setActiveZone('overview');
    setDockCollapsed(false);
    viewportRef.current?.selectAgent(null, false);
    viewportRef.current?.setCameraPreset('overview');
  }, []);

  const handleCloseAgentRoster = useCallback(() => {
    setAgentRosterOpen(false);
    setSelectedSpecialistId(null);
    setActiveDivision('dashboard');
    viewportRef.current?.selectAgent(null, false);
  }, []);

  const handleCloseProviderSettings = useCallback(() => {
    setProviderSettingsOpen(false);
    setActiveDivision('dashboard');
  }, []);

  const handleSaveProviderConfig = useCallback((next: ProviderConfig) => {
    setProviderConfig(next);
    try {
      window.localStorage.setItem(PROVIDER_CONFIG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
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
  }, []);

  const handleResetProviderConfig = useCallback(() => {
    const defaults = createDefaultProviderConfig();
    setProviderConfig(defaults);
    try {
      window.localStorage.setItem(PROVIDER_CONFIG_STORAGE_KEY, JSON.stringify(defaults));
    } catch {
      // Ignore storage quota errors
    }
    setActivityLog((prev) =>
      appendActivityLog(prev, [
        createStudioActivityEntry('Pengaturan koneksi AI dikembalikan ke setelan awal'),
      ])
    );
  }, []);

  const handleOpenChannelTemplates = useCallback(() => {
    setProviderSettingsOpen(false);
    setAgentRosterOpen(false);
    setDivisionToolMode(null);
    setMediaStudioOpen(false);
    setShortsFactoryOpen(true);
    setShortsFactoryTab('templates');
    setShortsFactoryTabNonce((n) => n + 1);
    setActiveZone('kode');
    viewportRef.current?.setCameraPreset('kode');
  }, []);

  const handleVoiceSynthesisEvent = useCallback(
    (phase: 'start' | 'done' | 'error', label: string) => {
      const voiceTaskId = 'elevenlabs_tts_preview';
      if (phase === 'start') {
        viewportRef.current?.startAgentTask('voice-artist', voiceTaskId, label);
      } else if (phase === 'done') {
        viewportRef.current?.finishAgentTask('voice-artist', voiceTaskId, true);
        setActivityLog((prev) =>
          appendActivityLog(prev, [
            createStudioActivityEntry(`Sora Permata menyelesaikan ${label}`),
          ])
        );
      } else {
        viewportRef.current?.finishAgentTask('voice-artist', voiceTaskId, false);
      }
    },
    []
  );

  const handleSelectSpecialist = useCallback((specialist: SpecialistAgentProfile | null) => {
    if (!specialist) {
      setSelectedSpecialistId(null);
      viewportRef.current?.selectAgent(null, false);
      return;
    }
    setSelectedSpecialistId(specialist.id);
    setActiveZone(specialist.officeZone);
    viewportRef.current?.selectAgent(specialist.id, true);
  }, []);

  const handleToggleMediaStudio = useCallback(() => {
    setMediaStudioOpen((prev) => {
      const next = !prev;
      if (next) {
        setAgentRosterOpen(false);
        setProviderSettingsOpen(false);
        setShortsFactoryOpen(false);
        setDivisionToolMode(null);
        setSelectedAgentId(null);
        setActiveDivision('video-editor');
        viewportRef.current?.selectAgent(null, false);
        setDockCollapsed(false);
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
        setAgentRosterOpen(false);
        setProviderSettingsOpen(false);
        setMediaStudioOpen(false);
        setDivisionToolMode(null);
        setSelectedAgentId(null);
        setActiveDivision('produksi-konten');
        viewportRef.current?.selectAgent(null, false);
        setDockCollapsed(false);
      } else {
        setActiveDivision('dashboard');
      }
      return next;
    });
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
      setShortsBriefPrefill({ ...payload, nonce: Date.now() });
      setDivisionToolMode(null);
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

  const handleUpsertShortsQueueItem = useCallback((item: ShortsQueueItem) => {
    setShortsQueue((prev) => {
      const exists = prev.some((q) => q.id === item.id);
      if (exists) {
        return prev.map((q) => (q.id === item.id ? item : q));
      }
      return [item, ...prev];
    });
  }, []);

  const handleUpdateShortsQueueStage = useCallback((id: string, stage: QueueStage) => {
    setShortsQueue((prev) =>
      prev.map((q) =>
        q.id === id ? { ...q, stage, updatedAt: new Date().toISOString() } : q
      )
    );
  }, []);

  const handleSaveChannelTemplate = useCallback((template: ChannelTemplateConfig) => {
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
  }, []);

  const handleResetChannelTemplate = useCallback((channelId: ShortsChannelId) => {
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
      return next;
    });
    const ch = getChannelById(channelId);
    setActivityLog((prev) =>
      appendActivityLog(prev, [
        createStudioActivityEntry(`Template ${ch.name} dikembalikan ke setelan awal`),
      ])
    );
  }, []);

  const handleShortsProductionEvent = useCallback((ev: ShortsProductionEvent) => {
    const taskId = `shorts_${Date.now()}`;
    if (ev.phase === 'start') {
      viewportRef.current?.startAgentTask('bible-researcher', `${taskId}_b`, `Riset Alkitab: ${ev.title}`);
      viewportRef.current?.startAgentTask('scriptwriter', `${taskId}_s`, `Naskah Shorts: ${ev.title}`);
      viewportRef.current?.startAgentTask('storyboard-artist', `${taskId}_v`, `Storyboard 9:16: ${ev.title}`);
      viewportRef.current?.startAgentTask('theological-guardian', `${taskId}_g`, `Audit Guardian: ${ev.title}`);
      setActivityLog((prev) =>
        appendActivityLog(prev, [
          createStudioActivityEntry(`Pabrik Shorts memulai produksi "${ev.title}" (${ev.channelName})`),
        ])
      );
    } else if (ev.phase === 'done') {
      viewportRef.current?.finishAgentTask('bible-researcher', `${taskId}_b`, true);
      viewportRef.current?.finishAgentTask('scriptwriter', `${taskId}_s`, true);
      viewportRef.current?.finishAgentTask('storyboard-artist', `${taskId}_v`, true);
      viewportRef.current?.finishAgentTask('theological-guardian', `${taskId}_g`, true);
      setActivityLog((prev) =>
        appendActivityLog(prev, [
          createStudioActivityEntry(
            `Pabrik Shorts selesai (${ev.guardianStatus ?? 'LULUS'}): "${ev.title}"`
          ),
        ])
      );
    } else {
      viewportRef.current?.finishAgentTask('bible-researcher', `${taskId}_b`, false);
      viewportRef.current?.finishAgentTask('scriptwriter', `${taskId}_s`, false);
      viewportRef.current?.finishAgentTask('storyboard-artist', `${taskId}_v`, false);
      viewportRef.current?.finishAgentTask('theological-guardian', `${taskId}_g`, false);
    }
  }, []);

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
      setMediaStudioOpen(true);
      setDockCollapsed(false);
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

  const handleProjectVideo = useCallback((item: GeneratedMediaItem | null) => {
    if (!item) {
      setProjectedVideoId(null);
      viewportRef.current?.projectVideoToOffice(null, '16:9', false);
      setActivityLog((prev) =>
        appendActivityLog(prev, [
          createStudioActivityEntry('Studio Media mengatur ulang Layar Rapat 3D'),
        ])
      );
      return;
    }
    const aspect: VideoAspectRatio = item.aspectRatio === '9:16' ? '9:16' : '16:9';
    setProjectedVideoId(item.id);
    setActiveZone('rapat');
    viewportRef.current?.projectVideoToOffice(item.dataUrl, aspect, true);
    setActivityLog((prev) =>
      appendActivityLog(prev, [
        createStudioActivityEntry(`Studio Media memproyeksikan video ${aspect} ke Layar Rapat 3D`),
      ])
    );
  }, []);

  const handleMountGalleryImage = useCallback((dataUrl: string | null, label = 'Karya Visual') => {
    setMountedImageUrl(dataUrl);
    if (!dataUrl) {
      viewportRef.current?.displayImageInOffice(null, false);
      setActivityLog((prev) =>
        appendActivityLog(prev, [
          createStudioActivityEntry('Studio Media mengatur ulang Bingkai Galeri 3D'),
        ])
      );
      return;
    }
    setActiveZone('kode');
    viewportRef.current?.displayImageInOffice(dataUrl, true);
    setActivityLog((prev) =>
      appendActivityLog(prev, [
        createStudioActivityEntry(`Studio Media memasang ${label} di Galeri Dinding 3D`),
      ])
    );
  }, []);

  const handleRunCommand = useCallback((command: OfficeCommand) => {
    viewportRef.current?.runOfficeCommand(command);
    if (command === 'standup') {
      setActiveZone('rapat');
      setSelectedAgentId(null);
      viewportRef.current?.selectAgent(null, false);
      viewportRef.current?.setCameraPreset('rapat');
    } else if (command === 'coffee_break') {
      setActiveZone('lounge');
      setSelectedAgentId(null);
      viewportRef.current?.selectAgent(null, false);
      viewportRef.current?.setCameraPreset('lounge');
    } else {
      setActiveZone('overview');
      setSelectedAgentId(null);
      viewportRef.current?.selectAgent(null, false);
      viewportRef.current?.setCameraPreset('overview');
    }
  }, []);

  const handleSubmitAgentTask = useCallback(
    async (agentId: AgentId, prompt: string) => {
      const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newEntry: TaskEntry = {
        id: taskId,
        agentId,
        prompt,
        status: 'running',
        createdAt: new Date().toISOString(),
      };

      setTasksByAgent((prev) => ({
        ...prev,
        [agentId]: [newEntry, ...prev[agentId]],
      }));

      viewportRef.current?.startAgentTask(agentId, taskId, prompt);

      // Browser-direct Ollama path (allows Cloud preview to call user's PC localhost Ollama with CORS enabled)
      const useBrowserOllama =
        providerConfig.ollama.enabled &&
        providerConfig.ollama.connectionMode === 'browser' &&
        providerConfig.llmRouting !== 'gemini';

      if (useBrowserOllama) {
        const specialist = getSpecialistById(agentId);
        const systemInstruction = specialist
          ? `Kamu adalah ${specialist.personName}, menjabat sebagai ${specialist.roleTitle} (${specialist.jobTitleId}) di studio produksi YouTube Shorts Kantor AI 3D. Fokus kerjamu: ${specialist.summary}. Jawab dalam Bahasa Indonesia yang ringkas dan siap eksekusi (maksimal 120 kata).`
          : 'Kamu adalah agen AI di Kantor AI 3D. Jawab ringkas dalam Bahasa Indonesia.';

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
              setTasksByAgent((prev) => ({
                ...prev,
                [agentId]: prev[agentId].map((t) =>
                  t.id === taskId
                    ? {
                        ...t,
                        status: 'completed',
                        output: `[Ollama Lokal · ${providerConfig.ollama.model}]\n${text}`,
                        completedAt: new Date().toISOString(),
                      }
                    : t
                ),
              }));
              viewportRef.current?.finishAgentTask(agentId, taskId, true);
              return;
            }
          }
          if (providerConfig.llmRouting === 'ollama') {
            throw new Error(`Ollama browser-direct HTTP ${ollamaRes.status}`);
          }
        } catch {
          if (providerConfig.llmRouting === 'ollama') {
            const errMessage = `Gagal terhubung ke Ollama lokal (${providerConfig.ollama.baseUrl}) dari browser. Pastikan "OLLAMA_ORIGINS=*" aktif atau ganti routing ke Otomatis.`;
            setTasksByAgent((prev) => ({
              ...prev,
              [agentId]: prev[agentId].map((t) =>
                t.id === taskId ? { ...t, status: 'error', error: errMessage } : t
              ),
            }));
            viewportRef.current?.finishAgentTask(agentId, taskId, false);
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
            agentId,
            task: prompt,
            providerConfig: serverProviderPayload,
          }),
        });

        const data = (await response.json()) as {
          output?: string;
          providerUsed?: string;
          modelUsed?: string;
          completedAt?: string;
          error?: string;
        };

        if (!response.ok || !data.output) {
          const errMessage = data.error || 'Gagal mendapatkan respons dari agen AI.';
          setTasksByAgent((prev) => ({
            ...prev,
            [agentId]: prev[agentId].map((t) =>
              t.id === taskId ? { ...t, status: 'error', error: errMessage } : t
            ),
          }));
          viewportRef.current?.finishAgentTask(agentId, taskId, false);
          return;
        }

        const sourcePrefix =
          data.providerUsed === 'ollama' && data.modelUsed
            ? `[Ollama · ${data.modelUsed}]\n`
            : '';

        setTasksByAgent((prev) => ({
          ...prev,
          [agentId]: prev[agentId].map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: 'completed',
                  output: `${sourcePrefix}${data.output}`,
                  completedAt: data.completedAt ?? new Date().toISOString(),
                }
              : t
          ),
        }));
        viewportRef.current?.finishAgentTask(agentId, taskId, true);
      } catch {
        const errMessage = 'Koneksi ke server tugas agen AI terputus.';
        setTasksByAgent((prev) => ({
          ...prev,
          [agentId]: prev[agentId].map((t) =>
            t.id === taskId ? { ...t, status: 'error', error: errMessage } : t
          ),
        }));
        viewportRef.current?.finishAgentTask(agentId, taskId, false);
      }
    },
    [providerConfig]
  );

  const handleSubmitSpecialistTask = useCallback(
    async (specialist: SpecialistAgentProfile, prompt: string) => {
      await handleSubmitAgentTask(specialist.id, prompt);
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

      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      } else if (e.key === 'Escape') {
        setAgentRosterOpen(false);
        setProviderSettingsOpen(false);
        setSelectedSpecialistId(null);
        setSelectedAgentId(null);
        setMediaStudioOpen(false);
        setShortsFactoryOpen(false);
        setDivisionToolMode(null);
        setActiveDivision('dashboard');
        viewportRef.current?.selectAgent(null, false);
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
      data-office-mode={simState.officeMode}
      data-active-division={activeDivision}
      data-lighting={lighting}
      data-selected-agent={selectedAgentId ?? 'none'}
      data-dock-collapsed={String(dockCollapsed)}
      data-media-studio-open={String(mediaStudioOpen)}
      data-shorts-factory-open={String(shortsFactoryOpen)}
      data-completed-tasks={String(simState.completedTaskCount)}
    >
      <OfficeViewport
        ref={viewportRef}
        onStateSnapshot={handleStateSnapshot}
        onAgentClicked={handleAgentClicked}
      />

      <OfficeHUD
        simState={simState}
        activityLog={activityLog}
        activeZone={activeZone}
        activeDivision={activeDivision}
        sidebarCollapsed={sidebarCollapsed}
        lighting={lighting}
        simSpeed={simSpeed}
        selectedAgentId={selectedAgentId}
        dockCollapsed={dockCollapsed}
        tasksByAgent={tasksByAgent}
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
        providerConfig={providerConfig}
        selectedSpecialistId={selectedSpecialistId}
        onSelectZone={handleSelectZone}
        onSelectDivision={handleSelectDivision}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
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
        onToggleDock={() => setDockCollapsed((prev) => !prev)}
        onToggleMediaStudio={handleToggleMediaStudio}
        onToggleShortsFactory={handleToggleShortsFactory}
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
