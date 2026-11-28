import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  Download,
  Film,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Square,
  Tv,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import { AGENT_PROFILES } from '../office/layout';
import type { GeneratedMediaItem } from '../office/mediaStudio';
import {
  CHANNEL_WORKFLOW_BLUEPRINTS,
  buildPipelineSrt,
  computePipelineProgress,
  createInitialStageStatuses,
  getChannelWorkflowBlueprint,
  resolveChannelKeySlot,
  validateOneCommandInput,
  type AssembledVideoArtifact,
  type FinalQcReport,
  type OneCommandPipelineInput,
  type PipelineRunState,
  type PipelineSceneCount,
  type PipelineSceneItem,
  type PipelineScriptArc,
  type PipelineStageId,
  type PipelineStageStatus,
  type PipelineStoryPlan,
  type PipelineYoutubeMetadata,
  type SceneAnimationMode,
} from '../office/productionPipeline';
import { clearActiveApiWorkContext, setActiveApiWorkContext } from '../firebase/apiFetch';
import type { AvSyncCheckReport } from '../office/floor2And3Workflows';
import type { ProviderConfig, ServerProviderStatus } from '../office/providerConfig';
import {
  YOUTUBE_CHANNELS,
  getChannelById,
  type ChannelTemplatesMap,
  type ShortsChannelId,
  type ShortsDuration,
  type ShortsQueueItem,
} from '../office/shortsFactory';
import { getFloorByChannelId } from '../office/buildingFloors';
import { uploadVideoToYoutube, type YoutubeUploadResult } from '../firebase/youtubeUpload';
import type { AgentId, LightingPreset } from '../office/types';

export interface OrchestratorStageEvent {
  runId?: string;
  channelId: ShortsChannelId;
  agentId: AgentId;
  stageId: PipelineStageId;
  stageTitle: string;
  phase: 'start' | 'done' | 'error';
  detail?: string;
}

export interface OrchestratorPrefill {
  channelId: ShortsChannelId;
  command: string;
  bookScope: string;
  durationSeconds: ShortsDuration;
  sceneCount: PipelineSceneCount;
  nonce: number;
}

interface ProductionOrchestratorDrawerProps {
  lighting: LightingPreset;
  initialChannelId?: ShortsChannelId;
  externalPrefill?: OrchestratorPrefill | null;
  masterBibleSourceName?: string | null;
  masterBibleVerseCount?: number;
  channelTemplates: ChannelTemplatesMap;
  providerConfig: ProviderConfig;
  onClose: () => void;
  onOpenShortsFactory: () => void;
  onOpenProviderSettings: () => void;
  onStageEvent: (ev: OrchestratorStageEvent) => void;
  onSaveToQueue: (item: ShortsQueueItem) => void;
  onProjectFinalVideo: (item: GeneratedMediaItem) => void;
}

type OrchestratorTab = 'command' | 'scenes' | 'final-qc' | 'routing';

function downloadBlobUrl(filename: string, dataUrl: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  downloadBlobUrl(filename, url);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function statusTextIndonesia(status: PipelineStageStatus): string {
  switch (status) {
    case 'running':
      return 'Berjalan';
    case 'completed':
      return 'Selesai';
    case 'warning':
      return 'Selesai dengan catatan';
    case 'error':
      return 'Gagal';
    default:
      return 'Menunggu';
  }
}

export function ProductionOrchestratorDrawer({
  lighting,
  initialChannelId,
  externalPrefill,
  masterBibleSourceName,
  masterBibleVerseCount = 0,
  channelTemplates,
  providerConfig,
  onClose,
  onOpenShortsFactory,
  onOpenProviderSettings,
  onStageEvent,
  onSaveToQueue,
  onProjectFinalVideo,
}: ProductionOrchestratorDrawerProps) {
  const isDark = lighting === 'malam';
  const [activeTab, setActiveTab] = useState<OrchestratorTab>('command');

  const startingChannel: ShortsChannelId =
    externalPrefill?.channelId ?? initialChannelId ?? 'bible-stories-3d';
  const defaultSample = CHANNEL_WORKFLOW_BLUEPRINTS[startingChannel].sampleCommands[0];
  const [channelId, setChannelId] = useState<ShortsChannelId>(startingChannel);
  const [command, setCommand] = useState<string>(externalPrefill?.command ?? defaultSample.command);
  const [bookScope, setBookScope] = useState<string>(
    externalPrefill?.bookScope ?? defaultSample.bookScope
  );
  const [durationSeconds, setDurationSeconds] = useState<ShortsDuration>(
    externalPrefill?.durationSeconds ?? defaultSample.durationSeconds
  );
  const [sceneCount, setSceneCount] = useState<PipelineSceneCount>(
    externalPrefill?.sceneCount ?? defaultSample.sceneCount
  );
  const [animationMode, setAnimationMode] = useState<SceneAnimationMode>('keyframe_kenburns');
  const [generateAudio, setGenerateAudio] = useState<boolean>(true);

  useEffect(() => {
    if (!externalPrefill) return;
    setChannelId(externalPrefill.channelId);
    setCommand(externalPrefill.command);
    setBookScope(externalPrefill.bookScope);
    setDurationSeconds(externalPrefill.durationSeconds);
    setSceneCount(externalPrefill.sceneCount);
    setActiveTab('command');
  }, [externalPrefill]);

  const [serverStatus, setServerStatus] = useState<ServerProviderStatus | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [running, setRunning] = useState<boolean>(false);
  const [sceneBusyKey, setSceneBusyKey] = useState<string | null>(null);
  const [runState, setRunState] = useState<PipelineRunState | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [youtubeUploadBusy, setYoutubeUploadBusy] = useState(false);
  const [youtubeUploadResult, setYoutubeUploadResult] = useState<YoutubeUploadResult | null>(null);
  const [youtubeUploadError, setYoutubeUploadError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);

  const commandInputId = useId();
  const scopeInputId = useId();

  useEffect(() => {
    let active = true;
    void fetch('/api/providers/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ServerProviderStatus | null) => {
        if (active && data) setServerStatus(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const activeBlueprint = useMemo(() => getChannelWorkflowBlueprint(channelId), [channelId]);
  const activeChannel = useMemo(() => getChannelById(channelId), [channelId]);
  const activeKeyDescriptor = useMemo(() => resolveChannelKeySlot(channelId), [channelId]);
  const activeRoutingSlot = useMemo(
    () => serverStatus?.channelRouting?.find((r) => r.channelId === channelId) ?? null,
    [serverStatus, channelId]
  );

  const progress = useMemo(
    () =>
      runState
        ? computePipelineProgress(runState.stageStatuses)
        : { completedCount: 0, totalStages: 9, percent: 0 },
    [runState]
  );

  const surfaceClass = isDark
    ? 'border-slate-700/90 bg-[#0a1322]/97 text-slate-100'
    : 'border-slate-200/95 bg-[#fcfbf8]/97 text-slate-900';
  const subtleBorder = isDark ? 'border-slate-800' : 'border-slate-200';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';
  const cardBg = isDark ? 'border-slate-800 bg-[#0f1c31]/90' : 'border-slate-200 bg-white';
  const inputBg = isDark
    ? 'border-slate-700 bg-[#0d192c] text-slate-100 placeholder:text-slate-500'
    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400';

  const handleSelectChannel = (nextChannelId: ShortsChannelId) => {
    setChannelId(nextChannelId);
    const bp = getChannelWorkflowBlueprint(nextChannelId);
    const preset = bp.sampleCommands[0];
    if (preset) {
      setCommand(preset.command);
      setBookScope(preset.bookScope);
      setDurationSeconds(preset.durationSeconds);
      setSceneCount(preset.sceneCount);
    }
    setFormError(null);
  };

  const updateStage = (
    stageId: PipelineStageId,
    status: PipelineStageStatus,
    note?: string,
    activeNext: PipelineStageId | null = status === 'running' ? stageId : null
  ) => {
    setRunState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        activeStageId: activeNext,
        stageStatuses: { ...prev.stageStatuses, [stageId]: status },
        stageNotes: note ? { ...prev.stageNotes, [stageId]: note } : prev.stageNotes,
      };
    });
  };

  const runStageEvent = (
    bp: ReturnType<typeof getChannelWorkflowBlueprint>,
    stageId: PipelineStageId,
    phase: 'start' | 'done' | 'error',
    detail?: string
  ) => {
    const stageDef = bp.stages.find((s) => s.id === stageId);
    if (!stageDef) return;
    onStageEvent({
      runId: activeRunIdRef.current ?? undefined,
      channelId: bp.channelId,
      agentId: stageDef.leadAgentId,
      stageId,
      stageTitle: stageDef.title,
      phase,
      detail,
    });
  };

  const handleStopRun = () => {
    abortRef.current?.abort();
    setRunning(false);
    setRunState((prev) =>
      prev
        ? {
            ...prev,
            activeStageId: null,
            errorMessage: 'Produksi dihentikan oleh pengguna. Aset yang sudah selesai tetap tersimpan.',
          }
        : prev
    );
  };

  const handleRunFullPipeline = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSavedNotice(null);

    const validated = validateOneCommandInput({
      channelId,
      command,
      bookScope,
      durationSeconds,
      sceneCount,
      animationMode,
      generateAudio,
    });
    if (!validated.ok) {
      setFormError(validated.error);
      return;
    }

    const input: OneCommandPipelineInput = validated.value;
    const bp = getChannelWorkflowBlueprint(input.channelId);
    const controller = new AbortController();
    abortRef.current = controller;

    const initialRun: PipelineRunState = {
      id: `pipe_${Date.now().toString(36)}`,
      input,
      startedAt: new Date().toISOString(),
      activeStageId: 'story_plan',
      stageStatuses: createInitialStageStatuses(),
      stageNotes: {},
      scenes: [],
      srtText: '',
    };

    activeRunIdRef.current = initialRun.id;
    setActiveApiWorkContext(initialRun.id, input.channelId);
    setRunState(initialRun);
    setRunning(true);

    try {
      // ---------------------------------------------------------------
      // TAHAP 1, 2, 3: Rencana Cerita -> Naskah & Alur -> Timestamp Adegan
      // ---------------------------------------------------------------
      updateStage('story_plan', 'running', 'Menyusun rencana seri & referensi kitab...');
      runStageEvent(bp, 'story_plan', 'start', input.command.slice(0, 70));

      const planRes = await fetch('/api/pipeline/plan-and-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          ...input,
          channelTemplate: channelTemplates[input.channelId],
          providerConfig,
        }),
      });
      const planData = (await planRes.json()) as {
        storyPlan?: PipelineStoryPlan;
        scriptArc?: PipelineScriptArc;
        scenes?: PipelineSceneItem[];
        srtText?: string;
        youtubeMetadata?: PipelineYoutubeMetadata;
        keySlotUsed?: string;
        providerUsed?: string;
        error?: string;
      };

      if (!planRes.ok || !planData.storyPlan || !planData.scriptArc || !planData.scenes) {
        const errText = planData.error ?? 'Gagal menyusun rencana cerita dan naskah.';
        updateStage('story_plan', 'error', errText, null);
        runStageEvent(bp, 'story_plan', 'error', errText);
        setRunState((prev) => (prev ? { ...prev, errorMessage: errText } : prev));
        return;
      }

      const workingScenes: PipelineSceneItem[] = planData.scenes;
      const workingStoryPlan = planData.storyPlan;
      const workingScriptArc = planData.scriptArc;
      const workingMeta = planData.youtubeMetadata;
      const workingSrt = planData.srtText ?? buildPipelineSrt(workingScenes);

      runStageEvent(bp, 'story_plan', 'done', workingStoryPlan.episodeTitle);
      runStageEvent(bp, 'script_arc', 'done', `${workingScriptArc.estimatedWordCount} kata`);
      runStageEvent(bp, 'timestamps', 'done', `${workingScenes.length} adegan ber-timestamp`);

      setRunState((prev) =>
        prev
          ? {
              ...prev,
              keySlotUsed: planData.keySlotUsed,
              providerUsed: planData.providerUsed,
              storyPlan: workingStoryPlan,
              scriptArc: workingScriptArc,
              scenes: workingScenes,
              srtText: workingSrt,
              youtubeMetadata: workingMeta,
              stageStatuses: {
                ...prev.stageStatuses,
                story_plan: 'completed',
                script_arc: 'completed',
                timestamps: 'completed',
              },
              stageNotes: {
                ...prev.stageNotes,
                story_plan: `${workingStoryPlan.bookOrScope} · ${workingStoryPlan.sequencePosition}`,
                script_arc: `${workingScriptArc.estimatedWordCount} kata · Hook & penutup siap`,
                timestamps: `${workingScenes.length} segmen (${input.durationSeconds} detik total) · SRT siap`,
              },
            }
          : prev
      );

      // ---------------------------------------------------------------
      // TAHAP 4: Gambar Patokan (Keyframe 9:16) per Adegan
      // ---------------------------------------------------------------
      updateStage('keyframes', 'running', `Membuat 0/${workingScenes.length} gambar patokan 9:16...`);
      runStageEvent(bp, 'keyframes', 'start', `${workingScenes.length} adegan`);

      let firstKeyframeUrl: string | undefined;
      let keyframeSuccessCount = 0;

      for (let i = 0; i < workingScenes.length; i++) {
        if (controller.signal.aborted) return;
        const sc = workingScenes[i];
        workingScenes[i] = { ...sc, keyframeStatus: 'running', keyframeError: undefined };
        setRunState((prev) =>
          prev
            ? {
                ...prev,
                scenes: [...workingScenes],
                stageNotes: {
                  ...prev.stageNotes,
                  keyframes: `Menghasilkan gambar patokan Adegan ${sc.sceneNumber}/${workingScenes.length}...`,
                },
              }
            : prev
        );

        try {
          const kfRes = await fetch('/api/pipeline/scene-keyframe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              channelId: input.channelId,
              prompt: sc.keyframePrompt,
              referenceImageDataUrl: i > 0 ? firstKeyframeUrl : undefined,
            }),
          });
          const kfData = (await kfRes.json()) as {
            dataUrl?: string;
            error?: string;
          };
          if (kfRes.ok && kfData.dataUrl) {
            if (!firstKeyframeUrl) firstKeyframeUrl = kfData.dataUrl;
            keyframeSuccessCount += 1;
            workingScenes[i] = {
              ...workingScenes[i],
              keyframeStatus: 'completed',
              keyframeDataUrl: kfData.dataUrl,
            };
          } else {
            workingScenes[i] = {
              ...workingScenes[i],
              keyframeStatus: 'error',
              keyframeError: kfData.error ?? 'Gagal membuat gambar patokan.',
            };
          }
        } catch (err) {
          if (controller.signal.aborted) return;
          workingScenes[i] = {
            ...workingScenes[i],
            keyframeStatus: 'error',
            keyframeError: err instanceof Error ? err.message : 'Koneksi gambar patokan terputus.',
          };
        }

        setRunState((prev) => (prev ? { ...prev, scenes: [...workingScenes] } : prev));
      }

      const kfStageStatus: PipelineStageStatus =
        keyframeSuccessCount === workingScenes.length
          ? 'completed'
          : keyframeSuccessCount > 0
          ? 'warning'
          : 'error';
      updateStage(
        'keyframes',
        kfStageStatus,
        `${keyframeSuccessCount}/${workingScenes.length} gambar patokan 9:16 berhasil dibuat`
      );
      runStageEvent(bp, 'keyframes', kfStageStatus === 'error' ? 'error' : 'done');

      // ---------------------------------------------------------------
      // TAHAP 5: Animasi per Adegan dari Gambar Patokan
      // ---------------------------------------------------------------
      updateStage(
        'animations',
        'running',
        input.animationMode === 'keyframe_to_video'
          ? 'Menganimasikan gambar patokan dengan Omni Flash...'
          : 'Menyiapkan gerak kamera sinematik FFmpeg dari gambar patokan...'
      );
      runStageEvent(bp, 'animations', 'start');

      let animatedCount = 0;
      if (input.animationMode === 'keyframe_to_video') {
        for (let i = 0; i < workingScenes.length; i++) {
          if (controller.signal.aborted) return;
          const sc = workingScenes[i];
          if (!sc.keyframeDataUrl) {
            workingScenes[i] = {
              ...sc,
              animationStatus: 'error',
              animationError: 'Melewati animasi karena gambar patokan belum tersedia.',
            };
            continue;
          }

          workingScenes[i] = { ...sc, animationStatus: 'running', animationError: undefined };
          setRunState((prev) =>
            prev
              ? {
                  ...prev,
                  scenes: [...workingScenes],
                  stageNotes: {
                    ...prev.stageNotes,
                    animations: `Menganimasikan Adegan ${sc.sceneNumber}/${workingScenes.length} (${sc.durationSec} dtk)...`,
                  },
                }
              : prev
          );

          try {
            const animRes = await fetch('/api/pipeline/scene-animate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                channelId: input.channelId,
                animationPrompt: sc.animationPrompt,
                keyframeDataUrl: sc.keyframeDataUrl,
                durationSec: sc.durationSec,
              }),
            });
            const animData = (await animRes.json()) as {
              dataUrl?: string;
              error?: string;
            };
            if (animRes.ok && animData.dataUrl) {
              animatedCount += 1;
              workingScenes[i] = {
                ...workingScenes[i],
                animationStatus: 'completed',
                videoDataUrl: animData.dataUrl,
              };
            } else {
              workingScenes[i] = {
                ...workingScenes[i],
                animationStatus: 'warning',
                animationError:
                  animData.error ?? 'Fallback ke gerak sinematik FFmpeg dari gambar patokan.',
              };
            }
          } catch (err) {
            if (controller.signal.aborted) return;
            workingScenes[i] = {
              ...workingScenes[i],
              animationStatus: 'warning',
              animationError:
                err instanceof Error
                  ? `${err.message} (fallback FFmpeg siap)`
                  : 'Fallback gerak sinematik FFmpeg dari gambar patokan.',
            };
          }

          setRunState((prev) => (prev ? { ...prev, scenes: [...workingScenes] } : prev));
        }
        updateStage(
          'animations',
          animatedCount === workingScenes.length ? 'completed' : 'warning',
          animatedCount > 0
            ? `${animatedCount}/${workingScenes.length} klip animasi AI jadi (sisanya memakai gerak sinematik keyframe)`
            : 'Model video AI butuh kunci berbayar/kuota — penggabungan memakai gerak sinematik FFmpeg dari gambar patokan.'
        );
      } else {
        for (let i = 0; i < workingScenes.length; i++) {
          if (workingScenes[i].keyframeDataUrl) {
            animatedCount += 1;
            workingScenes[i] = { ...workingScenes[i], animationStatus: 'completed' };
          }
        }
        setRunState((prev) => (prev ? { ...prev, scenes: [...workingScenes] } : prev));
        updateStage(
          'animations',
          animatedCount > 0 ? 'completed' : 'error',
          animatedCount > 0
            ? `${animatedCount} adegan siap dianimasikan dengan gerak kamera sinematik FFmpeg`
            : 'Belum ada gambar patokan yang bisa dianimasikan.'
        );
      }
      runStageEvent(bp, 'animations', animatedCount > 0 ? 'done' : 'error');

      // ---------------------------------------------------------------
      // TAHAP 6: Audio Narasi (ElevenLabs Channel Key Routing)
      // ---------------------------------------------------------------
      let narrationAudioDataUrl: string | undefined;
      if (input.generateAudio) {
        updateStage('narration_audio', 'running', 'Mensintesis suara narasi ElevenLabs...');
        runStageEvent(bp, 'narration_audio', 'start');
        try {
          const audioRes = await fetch('/api/pipeline/narration-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              channelId: input.channelId,
              text: workingScriptArc.fullNarrationScript,
              voiceId: providerConfig.elevenlabs.voiceId || resolveChannelKeySlot(input.channelId).voicePresetId,
              modelId: providerConfig.elevenlabs.modelId,
              stability: providerConfig.elevenlabs.stability,
              similarityBoost: providerConfig.elevenlabs.similarityBoost,
            }),
          });
          const audioData = (await audioRes.json()) as {
            dataUrl?: string;
            keySlotUsed?: string;
            charCount?: number;
            error?: string;
          };
          if (audioRes.ok && audioData.dataUrl) {
            narrationAudioDataUrl = audioData.dataUrl;
            setRunState((prev) =>
              prev
                ? {
                    ...prev,
                    narrationAudioDataUrl: audioData.dataUrl,
                    narrationAudioNote: `Audio MP3 jadi (${audioData.charCount ?? 0} karakter · ${audioData.keySlotUsed ?? 'ElevenLabs'})`,
                  }
                : prev
            );
            updateStage(
              'narration_audio',
              'completed',
              `Narasi MP3 selesai (${audioData.keySlotUsed ?? 'ElevenLabs'})`
            );
            runStageEvent(bp, 'narration_audio', 'done');
          } else {
            const note =
              audioData.error ?? 'ElevenLabs belum aktif — video tetap dapat digabungkan.';
            setRunState((prev) => (prev ? { ...prev, narrationAudioNote: note } : prev));
            updateStage('narration_audio', 'warning', note);
            runStageEvent(bp, 'narration_audio', 'done');
          }
        } catch {
          if (controller.signal.aborted) return;
          updateStage(
            'narration_audio',
            'warning',
            'Audio dilewati sementara; dapat diulang kapan saja.'
          );
          runStageEvent(bp, 'narration_audio', 'done');
        }
      } else {
        updateStage('narration_audio', 'warning', 'Narasi audio dinonaktifkan pada opsi perintah.');
      }

      // ---------------------------------------------------------------
      // TAHAP 7: QC Tahap 1 — Kecocokan Audio & Video per Adegan (Pra-Editor)
      // ---------------------------------------------------------------
      updateStage(
        'av_sync_check',
        'running',
        'Tim QC Tahap 1 mencocokkan kecocokan audio narasi & animasi visual setiap adegan sebelum masuk Editor...'
      );
      runStageEvent(bp, 'av_sync_check', 'start', `${workingScenes.length} adegan`);

      let avSyncApproved = true;
      try {
        const avRes = await fetch('/api/pipeline/av-sync-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            channelId: input.channelId,
            scenes: workingScenes,
            hasNarrationAudio: Boolean(narrationAudioDataUrl),
            expectedDurationSec: input.durationSeconds,
          }),
        });
        const avData = (await avRes.json()) as {
          report?: AvSyncCheckReport;
          error?: string;
        };
        if (avRes.ok && avData.report) {
          const avReport = avData.report;
          avSyncApproved = avReport.approvedForEditor;
          setRunState((prev) => (prev ? { ...prev, avSyncCheck: avReport } : prev));
          updateStage(
            'av_sync_check',
            avReport.approvedForEditor ? 'completed' : 'warning',
            `Skor Kecocokan ${avReport.matchScore}% (${avReport.readyVisualCount}/${avReport.checkedSceneCount} visual siap) — ${
              avReport.approvedForEditor
                ? 'Disetujui diteruskan ke Editor'
                : 'Diteruskan ke Editor dengan catatan revisi'
            }`
          );
          runStageEvent(bp, 'av_sync_check', 'done', `Skor ${avReport.matchScore}%`);
        } else {
          updateStage(
            'av_sync_check',
            'warning',
            avData.error ?? 'Pengecekan lokal QC Tahap 1 selesai dengan catatan; dilanjutkan ke Editor.'
          );
          runStageEvent(bp, 'av_sync_check', 'done');
        }
      } catch {
        if (controller.signal.aborted) return;
        updateStage(
          'av_sync_check',
          'warning',
          'Koneksi QC Tahap 1 terputus; Editor tetap melanjutkan penyatuan adegan.'
        );
        runStageEvent(bp, 'av_sync_check', 'done');
      }

      // ---------------------------------------------------------------
      // TAHAP 8: Penggabungan Adegan + Audio jadi 1 Video Final (FFmpeg)
      // ---------------------------------------------------------------
      const scenesReadyForAssembly = workingScenes.filter(
        (s) => s.videoDataUrl || s.keyframeDataUrl
      );
      let assembledArtifact: AssembledVideoArtifact | undefined;

      if (scenesReadyForAssembly.length > 0) {
        updateStage(
          'assemble_video',
          'running',
          avSyncApproved
            ? `Editor FFmpeg menggabungkan ${scenesReadyForAssembly.length} adegan terverifikasi QC Tahap 1 menjadi 1 MP4...`
            : `Editor FFmpeg menggabungkan ${scenesReadyForAssembly.length} adegan menjadi 1 MP4 9:16...`
        );
        runStageEvent(bp, 'assemble_video', 'start');

        try {
          const asmRes = await fetch('/api/pipeline/assemble-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              scenes: scenesReadyForAssembly.map((s) => ({
                sceneNumber: s.sceneNumber,
                durationSec: s.durationSec,
                videoDataUrl: s.videoDataUrl,
                keyframeDataUrl: s.keyframeDataUrl,
              })),
              audioDataUrl: narrationAudioDataUrl,
            }),
          });
          const asmData = (await asmRes.json()) as AssembledVideoArtifact & { error?: string };
          if (asmRes.ok && asmData.dataUrl) {
            assembledArtifact = asmData;
            setRunState((prev) => (prev ? { ...prev, assembledVideo: asmData } : prev));
            updateStage(
              'assemble_video',
              'completed',
              `Video final 9:16 jadi (${asmData.totalDurationSec} dtk · ${formatBytes(asmData.fileSizeBytes)})`
            );
            runStageEvent(bp, 'assemble_video', 'done');
          } else {
            const msg = asmData.error ?? 'Gagal menggabungkan video final.';
            updateStage('assemble_video', 'error', msg);
            runStageEvent(bp, 'assemble_video', 'error', msg);
          }
        } catch (err) {
          if (controller.signal.aborted) return;
          const msg = err instanceof Error ? err.message : 'Gagal menghubungi assembler FFmpeg.';
          updateStage('assemble_video', 'error', msg);
          runStageEvent(bp, 'assemble_video', 'error', msg);
        }
      } else {
        updateStage(
          'assemble_video',
          'error',
          'Belum ada gambar patokan/klip adegan yang siap digabungkan.'
        );
        runStageEvent(bp, 'assemble_video', 'error');
      }

      // ---------------------------------------------------------------
      // TAHAP 8: Quality Control (QC) Akhir Sebelum Upload YouTube
      // ---------------------------------------------------------------
      updateStage(
        'final_qc',
        'running',
        'Guardian & Pastoral Checker memeriksa keselarasan video final terhadap rencana cerita...'
      );
      runStageEvent(bp, 'final_qc', 'start');

      try {
        const qcRes = await fetch('/api/pipeline/final-qc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            channelId: input.channelId,
            storyPlan: workingStoryPlan,
            scriptArc: workingScriptArc,
            scenes: workingScenes,
            youtubeMetadata: workingMeta,
            hasAudio: Boolean(narrationAudioDataUrl),
            hasAssembledVideo: Boolean(assembledArtifact),
            assembledDurationSec: assembledArtifact?.totalDurationSec ?? 0,
          }),
        });
        const qcData = (await qcRes.json()) as {
          report?: FinalQcReport;
          error?: string;
        };

        if (qcRes.ok && qcData.report) {
          const report = qcData.report;
          setRunState((prev) =>
            prev
              ? {
                  ...prev,
                  finalQc: report,
                  completedAt: new Date().toISOString(),
                  activeStageId: null,
                }
              : prev
          );
          updateStage(
            'final_qc',
            report.readyForYoutubeUpload ? 'completed' : 'warning',
            `QC ${report.verdict} · Keselarasan Rencana ${report.planAlignmentScore}%`,
            null
          );
          runStageEvent(bp, 'final_qc', 'done', `${report.verdict} (${report.planAlignmentScore}%)`);
          setActiveTab('final-qc');
          if (report.readyForYoutubeUpload && assembledArtifact && workingMeta) {
            void publishYoutubeVideo({ id: initialRun.id, channelId: input.channelId, assembledVideo: assembledArtifact, youtubeMetadata: workingMeta, finalQc: report }, true);
          }
        } else {
          const msg = qcData.error ?? 'Gagal menjalankan Quality Control akhir.';
          updateStage('final_qc', 'error', msg, null);
          runStageEvent(bp, 'final_qc', 'error', msg);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : 'Koneksi QC akhir terputus.';
        updateStage('final_qc', 'error', msg, null);
        runStageEvent(bp, 'final_qc', 'error', msg);
      }
    } finally {
      clearActiveApiWorkContext(initialRun.id);
      setRunning(false);
    }
  };

  // Single-scene Keyframe retry
  const handleRegenerateKeyframe = async (sceneIdx: number) => {
    if (!runState) return;
    const sc = runState.scenes[sceneIdx];
    if (!sc) return;

    const busyKey = `kf-${sc.sceneNumber}`;
    setSceneBusyKey(busyKey);
    const refImg = sceneIdx > 0 ? runState.scenes[0]?.keyframeDataUrl : undefined;

    try {
      const res = await fetch('/api/pipeline/scene-keyframe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: runState.input.channelId,
          prompt: sc.keyframePrompt,
          referenceImageDataUrl: refImg,
        }),
      });
      const data = (await res.json()) as { dataUrl?: string; error?: string };
      setRunState((prev) => {
        if (!prev) return prev;
        const nextScenes = prev.scenes.map((item, idx) =>
          idx === sceneIdx
            ? res.ok && data.dataUrl
              ? {
                  ...item,
                  keyframeStatus: 'completed' as const,
                  keyframeDataUrl: data.dataUrl,
                  keyframeError: undefined,
                }
              : {
                  ...item,
                  keyframeStatus: 'error' as const,
                  keyframeError: data.error ?? 'Gagal membuat ulang gambar patokan.',
                }
            : item
        );
        return { ...prev, scenes: nextScenes };
      });
    } finally {
      setSceneBusyKey(null);
    }
  };

  // Single-scene Image-to-Video animation retry
  const handleAnimateSingleScene = async (sceneIdx: number) => {
    if (!runState) return;
    const sc = runState.scenes[sceneIdx];
    if (!sc || !sc.keyframeDataUrl) return;

    const busyKey = `anim-${sc.sceneNumber}`;
    setSceneBusyKey(busyKey);
    try {
      const res = await fetch('/api/pipeline/scene-animate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: runState.input.channelId,
          animationPrompt: sc.animationPrompt,
          keyframeDataUrl: sc.keyframeDataUrl,
          durationSec: sc.durationSec,
        }),
      });
      const data = (await res.json()) as { dataUrl?: string; error?: string };
      setRunState((prev) => {
        if (!prev) return prev;
        const nextScenes = prev.scenes.map((item, idx) =>
          idx === sceneIdx
            ? res.ok && data.dataUrl
              ? {
                  ...item,
                  animationStatus: 'completed' as const,
                  videoDataUrl: data.dataUrl,
                  animationError: undefined,
                }
              : {
                  ...item,
                  animationStatus: 'error' as const,
                  animationError: data.error ?? 'Gagal menganimasikan adegan.',
                }
            : item
        );
        return { ...prev, scenes: nextScenes };
      });
    } finally {
      setSceneBusyKey(null);
    }
  };

  // Re-assemble final video from current scenes + audio
  const handleReassembleVideo = async () => {
    if (!runState) return;
    const readyScenes = runState.scenes.filter((s) => s.videoDataUrl || s.keyframeDataUrl);
    if (readyScenes.length === 0) return;

    setSceneBusyKey('reassemble');
    updateStage('assemble_video', 'running', 'Menggabungkan ulang adegan menjadi 1 MP4 final...');
    try {
      const res = await fetch('/api/pipeline/assemble-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: readyScenes.map((s) => ({
            sceneNumber: s.sceneNumber,
            durationSec: s.durationSec,
            videoDataUrl: s.videoDataUrl,
            keyframeDataUrl: s.keyframeDataUrl,
          })),
          audioDataUrl: runState.narrationAudioDataUrl,
        }),
      });
      const data = (await res.json()) as AssembledVideoArtifact & { error?: string };
      if (res.ok && data.dataUrl) {
        setRunState((prev) => (prev ? { ...prev, assembledVideo: data } : prev));
        updateStage(
          'assemble_video',
          'completed',
          `Video final diperbarui (${data.totalDurationSec} dtk · ${formatBytes(data.fileSizeBytes)})`,
          null
        );
      } else {
        updateStage('assemble_video', 'error', data.error ?? 'Gagal menggabungkan ulang video.', null);
      }
    } finally {
      setSceneBusyKey(null);
    }
  };

  const publishYoutubeVideo = async (
    source: { id: string; channelId: ShortsChannelId; assembledVideo?: AssembledVideoArtifact; youtubeMetadata?: PipelineYoutubeMetadata; finalQc?: FinalQcReport },
    automatic: boolean
  ) => {
    if (!source.assembledVideo?.dataUrl || !source.youtubeMetadata || !source.finalQc?.readyForYoutubeUpload) {
      if (!automatic) setYoutubeUploadError('Video final dan QC LULUS wajib tersedia sebelum upload.');
      return;
    }
    if (youtubeUploadBusy) return;
    setYoutubeUploadBusy(true); setYoutubeUploadError(null); setYoutubeUploadResult(null);
    try {
      const statusResponse = await fetch('/api/youtube/status', { cache: 'no-store' });
      const statusData = await statusResponse.json() as { channels?: Array<{ channelId: string; connected: boolean; autoUploadEnabled: boolean; privacyStatus: 'private' | 'unlisted' | 'public' }>; error?: string };
      if (!statusResponse.ok) throw new Error(statusData.error || 'Tidak dapat membaca status akun YouTube.');
      const channel = statusData.channels?.find((item) => item.channelId === source.channelId);
      if (!channel?.connected) { if (automatic) return; throw new Error('Hubungkan akun YouTube untuk channel ini melalui Pengaturan → YouTube terlebih dahulu.'); }
      if (automatic && !channel.autoUploadEnabled) return;
      const result = await uploadVideoToYoutube({ channelId: source.channelId, videoDataUrl: source.assembledVideo.dataUrl, metadata: source.youtubeMetadata, privacyStatus: channel.privacyStatus || 'private', runId: source.id });
      setYoutubeUploadResult(result); setSavedNotice('Video berhasil diunggah ke YouTube: ' + result.title);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload YouTube gagal.';
      setYoutubeUploadError(message);
      if (automatic) setSavedNotice('QC lulus, tetapi upload otomatis gagal: ' + message);
    } finally { setYoutubeUploadBusy(false); }
  };
  const handleSaveApprovedToQueue = () => {
    if (!runState?.storyPlan || !runState.finalQc) return;
    const isApproved = runState.finalQc.readyForYoutubeUpload;
    onSaveToQueue({
      id: runState.id,
      channelId: runState.input.channelId,
      title: runState.youtubeMetadata?.seoTitle || runState.storyPlan.episodeTitle,
      bibleReference:
        runState.storyPlan.bibleReferences.join(', ') || runState.storyPlan.bookOrScope,
      durationSeconds: runState.input.durationSeconds,
      notes: `${runState.storyPlan.sequencePosition} — QC Akhir ${runState.finalQc.verdict} (${runState.finalQc.planAlignmentScore}%)`,
      stage: isApproved ? 'Siap Publikasi' : 'Dalam Produksi',
      guardianStatus: runState.finalQc.verdict,
      updatedAt: new Date().toISOString(),
    });
    setSavedNotice(
      isApproved
        ? `Episode "${runState.storyPlan.episodeTitle}" masuk antrean Siap Publikasi untuk ${activeChannel.name}.`
        : `Episode disimpan di antrean Dalam Produksi untuk revisi QC.`
    );
  };

  const handleProjectTo3dOffice = () => {
    if (!runState?.assembledVideo) return;
    onProjectFinalVideo({
      id: `${runState.id}_final`,
      kind: 'video',
      prompt: runState.storyPlan?.episodeTitle || runState.input.command,
      aspectRatio: '9:16',
      dataUrl: runState.assembledVideo.dataUrl,
      mimeType: 'video/mp4',
      createdAt: runState.assembledVideo.createdAt,
      caption: `${activeChannel.name} · ${runState.assembledVideo.totalDurationSec}s Final Shorts`,
    });
    setSavedNotice('Video final 9:16 sedang diputar langsung di layar studio 3D Kantor AI.');
  };

  return (
    <section
      aria-label="Orkestrator Produksi 1-Perintah Kantor AI 3D"
      data-testid="production-orchestrator-drawer"
      className={`pointer-events-auto mb-2 flex max-h-[min(58vh,510px)] w-full flex-col overflow-hidden rounded-xl border shadow-2xl transition-colors duration-200 ${surfaceClass}`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between gap-3 border-b px-4 py-2.5 ${subtleBorder}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
            <h2 className="truncate text-sm font-bold tracking-tight">
              Orkestrator Produksi 1-Perintah
            </h2>
          </div>
          <p className={`truncate text-[11px] ${mutedText}`}>
            Pipa ujung ke ujung 9 tahap · QC 2 Tahap (Audio–Video &amp; QC Akhir) · Perutean 3 Kunci API
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenShortsFactory}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              isDark
                ? 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            Pabrik Shorts
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Orkestrator Produksi"
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

      {/* Primary Navigation Tabs */}
      <div className={`flex flex-wrap items-center gap-1 border-b px-4 py-1.5 ${subtleBorder}`}>
        {(
          [
            { id: 'command', label: '01. Perintah & Alur' },
            {
              id: 'scenes',
              label: runState?.scenes.length
                ? `02. Adegan (${runState.scenes.length})`
                : '02. Adegan & Timestamp',
            },
            { id: 'final-qc', label: '03. Video Final & QC' },
            { id: 'routing', label: '04. Rute 3 Kunci API' },
          ] as Array<{ id: OrchestratorTab; label: string }>
        ).map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                active
                  ? isDark
                    ? 'bg-[#192942] text-white'
                    : 'bg-slate-900 text-white'
                  : `${mutedText} hover:text-current`
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3.5">
        {activeTab === 'command' && (
          <>
            {/* Channel Selector (3 YouTube Channels) */}
            <section aria-label="Pilih Channel YouTube Target" className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider opacity-80">
                  1. Pilih Channel &amp; Alur Kerja Spesifik
                </h3>
                <span className={`font-mono text-[11px] ${mutedText}`}>
                  Slot Kunci: {activeKeyDescriptor.geminiEnvVar}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {YOUTUBE_CHANNELS.map((ch) => {
                  const selected = ch.id === channelId;
                  const slot = serverStatus?.channelRouting?.find((r) => r.channelId === ch.id);
                  const floorMeta = getFloorByChannelId(ch.id);
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      disabled={running}
                      aria-pressed={selected}
                      onClick={() => handleSelectChannel(ch.id)}
                      className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${
                        selected
                          ? isDark
                            ? 'border-sky-400 bg-[#132540] text-white'
                            : 'border-slate-900 bg-slate-900 text-white'
                          : `${cardBg} hover:border-slate-400`
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-xs"
                          style={{ backgroundColor: floorMeta.accentHex }}
                          aria-hidden="true"
                        />
                        <span className="truncate text-xs font-bold">{ch.name}</span>
                        <span
                          className={`ml-auto shrink-0 font-mono text-[10px] font-semibold ${
                            selected ? 'text-sky-200' : mutedText
                          }`}
                        >
                          L{floorMeta.floorId}
                        </span>
                      </div>
                      <p
                        className={`mt-1 line-clamp-2 text-[11px] leading-snug ${
                          selected ? 'text-slate-200' : mutedText
                        }`}
                      >
                        {ch.focus}
                      </p>
                      <p
                        className={`mt-1.5 font-mono text-[10px] ${
                          selected ? 'text-sky-200' : mutedText
                        }`}
                      >
                        {slot?.geminiSource === 'dedicated'
                          ? 'API Key Khusus Lantai Aktif'
                          : slot?.geminiSource === 'fallback_global'
                          ? 'Fallback Key Global'
                          : 'Slot Siap Dikonfigurasi'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 1-Command Form */}
            <form onSubmit={(e) => void handleRunFullPipeline(e)} className={`space-y-3 rounded-xl border p-4 ${cardBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold">{activeBlueprint.workflowTitle}</h3>
                  <p className={`mt-0.5 text-xs leading-relaxed ${mutedText}`}>
                    {activeBlueprint.summary}
                  </p>
                </div>
              </div>

              {/* Preset 1-Command Starters */}
              <div className="space-y-1.5">
                <span className={`block text-[11px] font-semibold ${mutedText}`}>
                  Contoh 1-Perintah Siap Pakai:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {activeBlueprint.sampleCommands.map((sample) => (
                    <button
                      key={sample.label}
                      type="button"
                      disabled={running}
                      onClick={() => {
                        setCommand(sample.command);
                        setBookScope(sample.bookScope);
                        setDurationSeconds(sample.durationSeconds);
                        setSceneCount(sample.sceneCount);
                        setFormError(null);
                      }}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                        isDark
                          ? 'border-slate-700 bg-slate-900/70 text-slate-200 hover:border-sky-400'
                          : 'border-slate-300 bg-slate-50 text-slate-800 hover:border-slate-900'
                      }`}
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor={commandInputId} className="block text-xs font-semibold">
                  Perintah Produksi (1 Perintah untuk Seluruh 9 Tahap)
                </label>
                <textarea
                  id={commandInputId}
                  rows={3}
                  disabled={running}
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="Contoh: Buatkan cerita lengkap 1 pasal (Kejadian 1) berdurasi 2m 50d dengan 17 adegan x 10 detik, percakapan masuk narasi audio, cek kecocokan audio-video, penyatuan editor, dan QC akhir..."
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-xs leading-relaxed focus:border-blue-500 focus:outline-none ${inputBg}`}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor={scopeInputId} className="block text-xs font-semibold">
                    Kitab / Cakupan Seri
                  </label>
                  <input
                    id={scopeInputId}
                    type="text"
                    disabled={running}
                    value={bookScope}
                    onChange={(e) => setBookScope(e.target.value)}
                    placeholder={activeBlueprint.defaultBookScope}
                    className={`mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none ${inputBg}`}
                  />
                </div>

                <div>
                  <span className="block text-xs font-semibold">Durasi Target</span>
                  <div className="mt-1 grid grid-cols-4 gap-1">
                    {([30, 45, 60, 170] as ShortsDuration[]).map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        disabled={running}
                        onClick={() => {
                          setDurationSeconds(dur);
                          if (dur === 170) {
                            setSceneCount(channelId === 'daily-faith-inspiration' ? 6 : 17);
                          }
                        }}
                        className={`rounded-lg border py-1.5 text-[11px] font-semibold transition-colors ${
                          durationSeconds === dur
                            ? isDark
                              ? 'border-sky-400 bg-sky-600 text-white'
                              : 'border-slate-900 bg-slate-900 text-white'
                            : `${subtleBorder} ${mutedText}`
                        }`}
                      >
                        {dur === 170 ? '2m 50d' : `${dur} dtk`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold">Jumlah Adegan</span>
                  <div className="mt-1 grid grid-cols-4 gap-1">
                    {([4, 5, 6, 17] as PipelineSceneCount[]).map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        disabled={running}
                        onClick={() => {
                          setSceneCount(cnt);
                          if (cnt === 17) setDurationSeconds(170);
                        }}
                        className={`rounded-lg border py-1.5 text-[11px] font-semibold transition-colors ${
                          sceneCount === cnt
                            ? isDark
                              ? 'border-sky-400 bg-sky-600 text-white'
                              : 'border-slate-900 bg-slate-900 text-white'
                            : `${subtleBorder} ${mutedText}`
                        }`}
                      >
                        {cnt === 17 ? '17×10d' : `${cnt} adg`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {masterBibleSourceName && masterBibleVerseCount > 0 && (
                <div
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-[11px] ${
                    isDark
                      ? 'border-emerald-700/60 bg-emerald-950/35 text-emerald-200'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  }`}
                >
                  <span className="font-medium">
                    Sumber Utama Aktif: {masterBibleSourceName}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums">
                    {masterBibleVerseCount.toLocaleString('id-ID')} ayat TB · Wajib L1–L3
                  </span>
                </div>
              )}

              {/* Animation Engine Mode + Audio Toggle */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={running}
                  aria-pressed={animationMode === 'keyframe_kenburns'}
                  onClick={() => setAnimationMode('keyframe_kenburns')}
                  className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                    animationMode === 'keyframe_kenburns'
                      ? isDark
                        ? 'border-sky-400 bg-[#132540] text-white'
                        : 'border-slate-900 bg-slate-900 text-white'
                      : `${subtleBorder} ${mutedText}`
                  }`}
                >
                  <p className="font-semibold">Keyframe AI + Gerak Sinematik FFmpeg</p>
                  <p className="mt-0.5 text-[11px] opacity-80">
                    Cepat (~25 dtk) · Gambar patokan 9:16 konsisten lalu dianimasikan halus per adegan
                  </p>
                </button>

                <button
                  type="button"
                  disabled={running}
                  aria-pressed={animationMode === 'keyframe_to_video'}
                  onClick={() => setAnimationMode('keyframe_to_video')}
                  className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                    animationMode === 'keyframe_to_video'
                      ? isDark
                        ? 'border-sky-400 bg-[#132540] text-white'
                        : 'border-slate-900 bg-slate-900 text-white'
                      : `${subtleBorder} ${mutedText}`
                  }`}
                >
                  <p className="font-semibold">Keyframe AI → Video AI (Omni Flash)</p>
                  <p className="mt-0.5 text-[11px] opacity-80">
                    Animasi penuh Image-to-Video per adegan (~1–3 mnt) · fallback otomatis ke FFmpeg
                  </p>
                </button>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  disabled={running}
                  checked={generateAudio}
                  onChange={(e) => setGenerateAudio(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-400"
                />
                <span>
                  Hasilkan audio narasi otomatis via ElevenLabs ({activeKeyDescriptor.elevenLabsEnvVar})
                </span>
              </label>

              {formError && (
                <div
                  role="alert"
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                    isDark
                      ? 'border-rose-500/40 bg-rose-950/50 text-rose-200'
                      : 'border-rose-300 bg-rose-50 text-rose-800'
                  }`}
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className={`text-[11px] ${mutedText}`}>
                  FFmpeg Server:{' '}
                  <strong className={serverStatus?.ffmpegAvailable ? 'text-emerald-500' : ''}>
                    {serverStatus?.ffmpegAvailable ? 'Aktif (Penggabungan MP4 Siap)' : 'Memeriksa...'}
                  </strong>
                </span>

                <div className="flex items-center gap-2">
                  {running ? (
                    <button
                      type="button"
                      onClick={handleStopRun}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
                    >
                      <Square className="h-3.5 w-3.5" aria-hidden="true" />
                      Hentikan Pipa
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                        isDark
                          ? 'bg-sky-600 text-white hover:bg-sky-500'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      Jalankan Pipa 1-Perintah
                    </button>
                  )}
                </div>
              </div>
            </form>

            {/* Live 9-Stage Pipeline Tracker */}
            <section aria-label="Progres 9 Tahap Produksi" className={`rounded-xl border p-4 ${cardBg}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider opacity-80">
                    Alur Eksekusi 9 Tahap — {activeChannel.name}
                  </h3>
                  <p className={`mt-0.5 text-[11px] ${mutedText}`}>
                    {runState
                      ? `Progres ${progress.completedCount}/${progress.totalStages} tahap (${progress.percent}%)${
                          runState.keySlotUsed ? ` · Kunci: ${runState.keySlotUsed}` : ''
                        }`
                      : 'Setiap tahap dikerjakan berurutan oleh agen 3D yang bertugas di kantor.'}
                  </p>
                </div>
                {runState && (
                  <span className="font-mono text-xs font-bold tabular-nums">
                    {progress.percent}%
                  </span>
                )}
              </div>

              {runState && (
                <div className={`mt-2.5 h-1.5 w-full overflow-hidden rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                  <div
                    className="h-full bg-sky-500 transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              )}

              {runState?.errorMessage && (
                <div
                  role="alert"
                  className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                    isDark
                      ? 'border-amber-500/40 bg-amber-950/40 text-amber-200'
                      : 'border-amber-300 bg-amber-50 text-amber-900'
                  }`}
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{runState.errorMessage}</span>
                </div>
              )}

              <ol className={`mt-3 divide-y ${subtleBorder}`}>
                {activeBlueprint.stages.map((stage) => {
                  const st: PipelineStageStatus = runState?.stageStatuses[stage.id] ?? 'pending';
                  const note = runState?.stageNotes[stage.id];
                  const lead = AGENT_PROFILES[stage.leadAgentId];
                  return (
                    <li key={stage.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center font-mono text-[11px] font-bold">
                          {st === 'running' ? (
                            <Loader2 className="h-4 w-4 animate-spin text-sky-500" aria-hidden="true" />
                          ) : st === 'completed' ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                          ) : st === 'warning' ? (
                            <AlertCircle className="h-4 w-4 text-amber-500" aria-hidden="true" />
                          ) : st === 'error' ? (
                            <ShieldAlert className="h-4 w-4 text-rose-500" aria-hidden="true" />
                          ) : (
                            <span className={mutedText}>
                              {String(stage.order).padStart(2, '0')}
                            </span>
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold">{stage.title}</p>
                          <p className={`mt-0.5 text-[11px] leading-snug ${mutedText}`}>
                            {note || stage.subtitle}
                          </p>
                          <p className={`mt-1 text-[11px] ${mutedText}`}>
                            Penanggung jawab: <strong className="font-medium text-current">{lead.name}</strong> ({lead.role}) · Output: {stage.deliverableLabel}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-[11px] font-medium ${
                          st === 'completed'
                            ? 'text-emerald-500'
                            : st === 'running'
                            ? 'text-sky-500'
                            : st === 'warning'
                            ? 'text-amber-500'
                            : st === 'error'
                            ? 'text-rose-500'
                            : mutedText
                        }`}
                      >
                        {statusTextIndonesia(st)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          </>
        )}

        {activeTab === 'scenes' && (
          <>
            {!runState || !runState.storyPlan ? (
              <div className={`rounded-xl border p-6 text-center text-xs ${cardBg}`}>
                <Layers className={`mx-auto h-6 w-6 ${mutedText}`} aria-hidden="true" />
                <p className="mt-2 font-semibold">Belum ada proyek yang sedang berjalan</p>
                <p className={`mt-1 ${mutedText}`}>
                  Kembali ke tab 01. Perintah &amp; Alur lalu klik &ldquo;Jalankan Pipa 1-Perintah&rdquo; untuk menghasilkan rencana cerita, naskah, timestamp, gambar patokan, dan animasi.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Story Plan & Full Script Summary */}
                <div className={`space-y-2.5 rounded-xl border p-4 ${cardBg}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className={`text-[11px] font-medium ${mutedText}`}>
                        {runState.storyPlan.seriesTitle} · {runState.storyPlan.sequencePosition}
                      </p>
                      <h3 className="text-sm font-bold">{runState.storyPlan.episodeTitle}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        downloadText(`${runState.id}.srt`, runState.srtText, 'text/plain;charset=utf-8')
                      }
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                        isDark
                          ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                          : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      Unduh SRT
                    </button>
                  </div>

                  <p className={`text-xs leading-relaxed ${mutedText}`}>
                    <strong>Pesan Inti:</strong> {runState.storyPlan.coreMessage}
                    {runState.storyPlan.bibleReferences.length > 0
                      ? ` · Ayat: ${runState.storyPlan.bibleReferences.join(', ')}`
                      : ''}
                  </p>

                  {runState.scriptArc && (
                    <div className={`rounded-lg border p-3 text-xs leading-relaxed ${subtleBorder}`}>
                      <p className="font-semibold">Naskah Narasi Utuh ({runState.scriptArc.estimatedWordCount} kata)</p>
                      <p className={`mt-1 whitespace-pre-line ${mutedText}`}>
                        {runState.scriptArc.fullNarrationScript}
                      </p>
                    </div>
                  )}

                  {runState.narrationAudioDataUrl && (
                    <div className="pt-1">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                        <Volume2 className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
                        Audio Narasi · {runState.narrationAudioNote}
                      </p>
                      <audio controls src={runState.narrationAudioDataUrl} className="h-9 w-full" />
                    </div>
                  )}
                </div>

                {/* Timestamped Scene Cards (Keyframe -> Animation per Scene) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider opacity-80">
                      Adegan Ber-Timestamp · Gambar Patokan &amp; Animasi
                    </h3>
                    <button
                      type="button"
                      disabled={running || sceneBusyKey === 'reassemble'}
                      onClick={() => void handleReassembleVideo()}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                        isDark
                          ? 'bg-sky-600 text-white hover:bg-sky-500'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {sceneBusyKey === 'reassemble' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Film className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Gabungkan Semua Adegan
                    </button>
                  </div>

                  {runState.scenes.map((sc, idx) => (
                    <div key={sc.sceneNumber} className={`rounded-xl border p-3.5 ${cardBg}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h4 className="text-xs font-bold">
                          Adegan 0{sc.sceneNumber} · {sc.timecodeLabel} ({sc.durationSec} detik)
                        </h4>
                        <span className={`text-[11px] ${mutedText}`}>
                          Kamera: {sc.cameraMotion}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs leading-relaxed">
                        &ldquo;{sc.narrationText}&rdquo;
                      </p>
                      <p className={`mt-1 text-[11px] ${mutedText}`}>
                        Visual: {sc.visualDescription}
                      </p>

                      {/* Media Preview Row: Keyframe Anchor -> Animated Video */}
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className={`rounded-lg border p-2.5 ${subtleBorder}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                              <ImageIcon className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                              Gambar Patokan (9:16)
                            </span>
                            <button
                              type="button"
                              disabled={running || sceneBusyKey !== null}
                              onClick={() => void handleRegenerateKeyframe(idx)}
                              className={`inline-flex items-center gap-1 text-[11px] font-medium hover:underline disabled:opacity-50 ${mutedText}`}
                            >
                              {sceneBusyKey === `kf-${sc.sceneNumber}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                              ) : (
                                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                              )}
                              Buat Ulang
                            </button>
                          </div>
                          {sc.keyframeDataUrl ? (
                            <img
                              src={sc.keyframeDataUrl}
                              alt={`Gambar patokan Adegan ${sc.sceneNumber}`}
                              className="mt-2 aspect-[9/16] max-h-56 w-full rounded-md object-cover"
                            />
                          ) : (
                            <p className={`mt-2 text-[11px] ${mutedText}`}>
                              {sc.keyframeStatus === 'running'
                                ? 'Sedang menghasilkan gambar patokan...'
                                : sc.keyframeError || 'Belum dibuat.'}
                            </p>
                          )}
                        </div>

                        <div className={`rounded-lg border p-2.5 ${subtleBorder}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                              <Wand2 className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
                              Animasi Adegan ({sc.durationSec} dtk)
                            </span>
                            <button
                              type="button"
                              disabled={running || sceneBusyKey !== null || !sc.keyframeDataUrl}
                              onClick={() => void handleAnimateSingleScene(idx)}
                              className={`inline-flex items-center gap-1 text-[11px] font-medium hover:underline disabled:opacity-50 ${mutedText}`}
                            >
                              {sceneBusyKey === `anim-${sc.sceneNumber}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                              ) : (
                                <Play className="h-3 w-3" aria-hidden="true" />
                              )}
                              Animasikan AI
                            </button>
                          </div>
                          {sc.videoDataUrl ? (
                            <video
                              src={sc.videoDataUrl}
                              controls
                              playsInline
                              className="mt-2 aspect-[9/16] max-h-56 w-full rounded-md bg-black object-cover"
                            />
                          ) : (
                            <p className={`mt-2 text-[11px] leading-relaxed ${mutedText}`}>
                              {sc.animationStatus === 'running'
                                ? 'Sedang menganimasikan dari gambar patokan (Omni Flash)...'
                                : sc.animationError
                                ? sc.animationError
                                : sc.keyframeDataUrl
                                ? 'Siap memakai gerak kamera sinematik FFmpeg saat penggabungan (atau klik "Animasikan AI" untuk klip Omni Flash).'
                                : 'Menunggu gambar patokan.'}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'final-qc' && (
          <>
            {!runState ? (
              <div className={`rounded-xl border p-6 text-center text-xs ${cardBg}`}>
                <ShieldCheck className={`mx-auto h-6 w-6 ${mutedText}`} aria-hidden="true" />
                <p className="mt-2 font-semibold">Hasil Video Final &amp; Audit QC Akhir</p>
                <p className={`mt-1 ${mutedText}`}>
                  Jalankan pipa 1-perintah terlebih dahulu agar video final 9:16 dan laporan Quality Control muncul di sini.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {savedNotice && (
                  <div
                    role="status"
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                      isDark
                        ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-200'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-900'
                    }`}
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{savedNotice}</span>
                  </div>
                )}

                {/* Final Assembled Video Card */}
                <div className={`rounded-xl border p-4 ${cardBg}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold">Video Final Terpadu (9:16 YouTube Shorts)</h3>
                      <p className={`mt-0.5 text-[11px] ${mutedText}`}>
                        {runState.assembledVideo
                          ? `${runState.assembledVideo.sceneCount} adegan tergabung · ${runState.assembledVideo.totalDurationSec} detik · ${formatBytes(
                              runState.assembledVideo.fileSizeBytes
                            )} · ${runState.assembledVideo.hasAudio ? 'Dengan Narasi Audio' : 'Track Audio Hening'}`
                          : 'Video final belum tergabung.'}
                      </p>
                    </div>
                    {runState.assembledVideo && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleProjectTo3dOffice}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                            isDark
                              ? 'border-slate-700 text-slate-100 hover:bg-slate-800'
                              : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <Tv className="h-3.5 w-3.5" aria-hidden="true" />
                          Putar di Layar 3D
                        </button>
                        {runState.finalQc?.readyForYoutubeUpload && runState.youtubeMetadata && (
                          <button type="button" disabled={youtubeUploadBusy} onClick={() => void publishYoutubeVideo({ ...runState, channelId: runState.input.channelId }, false)}
                            className={'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ' + (isDark ? 'bg-red-600 hover:bg-red-500' : 'bg-red-700 hover:bg-red-600')}>
                            {youtubeUploadBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                            Upload ke YouTube
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            downloadBlobUrl(
                              `${runState.input.channelId}_${runState.id}.mp4`,
                              runState.assembledVideo!.dataUrl
                            )
                          }
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                            isDark
                              ? 'bg-sky-600 text-white hover:bg-sky-500'
                              : 'bg-slate-900 text-white hover:bg-slate-800'
                          }`}
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          Unduh MP4
                        </button>
                      </div>
                    )}
                  </div>

                  {youtubeUploadResult && (
                    <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs">
                      <p className="font-semibold text-emerald-500">Video berhasil diunggah</p>
                      <a className="mt-1 inline-block underline" href={youtubeUploadResult.videoUrl} target="_blank" rel="noreferrer">{youtubeUploadResult.title} — Buka YouTube</a>
                    </div>
                  )}
                  {youtubeUploadError && <p role="alert" className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-500">{youtubeUploadError}</p>}
                  {runState.assembledVideo ? (
                    <div className="mt-3 flex justify-center rounded-lg bg-black/90 p-2">
                      <video
                        src={runState.assembledVideo.dataUrl}
                        controls
                        playsInline
                        className="aspect-[9/16] max-h-[360px] rounded"
                      />
                    </div>
                  ) : (
                    <p className={`mt-2 text-xs ${mutedText}`}>
                      {runState.stageNotes.assemble_video ||
                        'Selesaikan pembuatan gambar patokan/animasi lalu klik Gabungkan Semua Adegan.'}
                    </p>
                  )}
                </div>

                {/* QC Tahap 1: Audio-Video Scene Sync Report (Pre-Editor) */}
                {runState.avSyncCheck && (
                  <div className={`rounded-xl border p-4 ${cardBg}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold">
                          QC Tahap 1 — Kecocokan Audio &amp; Video per Adegan (Pra-Editor)
                        </h3>
                        <p className={`mt-0.5 text-xs ${mutedText}`}>
                          Skor Kecocokan: {runState.avSyncCheck.matchScore}% · Visual Siap:{' '}
                          {runState.avSyncCheck.readyVisualCount}/{runState.avSyncCheck.checkedSceneCount}{' '}
                          adegan ·{' '}
                          {runState.avSyncCheck.approvedForEditor
                            ? 'Lulus & Diteruskan ke Editor'
                            : 'Perlu Penyesuaian Adegan'}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed">{runState.avSyncCheck.summary}</p>
                  </div>
                )}

                {/* Final Quality Control Report (QC Tahap 2) */}
                <div className={`rounded-xl border p-4 ${cardBg}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold">
                        QC Tahap 2 (QC Akhir) — Keselarasan Rencana Cerita Alkitab
                      </h3>
                      <p className={`mt-0.5 text-xs ${mutedText}`}>
                        {runState.finalQc
                          ? `Status: ${runState.finalQc.verdict} · Skor Keselarasan Rencana: ${runState.finalQc.planAlignmentScore}% · Channel: ${activeChannel.name}`
                          : 'Menunggu audit Quality Control akhir.'}
                      </p>
                    </div>
                    {runState.finalQc && (
                      <button
                        type="button"
                        onClick={handleSaveApprovedToQueue}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                          runState.finalQc.readyForYoutubeUpload
                            ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                            : isDark
                            ? 'border border-slate-700 text-slate-200 hover:bg-slate-800'
                            : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                        }`}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        {runState.finalQc.readyForYoutubeUpload
                          ? 'Masuk Antrean Siap Upload'
                          : 'Simpan sebagai Revisi'}
                      </button>
                    )}
                  </div>

                  {runState.finalQc && (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs leading-relaxed">{runState.finalQc.summary}</p>

                      <ul className={`divide-y rounded-lg border text-xs ${subtleBorder}`}>
                        {runState.finalQc.checks.map((chk) => (
                          <li key={chk.id} className="flex items-start gap-2.5 px-3 py-2">
                            {chk.passed ? (
                              <CheckCircle2
                                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                                aria-hidden="true"
                              />
                            ) : (
                              <ShieldAlert
                                className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                                aria-hidden="true"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold">{chk.label}</p>
                              <p className={`mt-0.5 text-[11px] ${mutedText}`}>{chk.note}</p>
                            </div>
                          </li>
                        ))}
                      </ul>

                      {runState.finalQc.revisionItems.length > 0 && (
                        <div className={`rounded-lg border p-3 text-xs ${subtleBorder}`}>
                          <p className="font-semibold">Catatan Revisi QC:</p>
                          <ul className={`mt-1 list-disc space-y-0.5 pl-4 ${mutedText}`}>
                            {runState.finalQc.revisionItems.map((rev, i) => (
                              <li key={i}>{rev}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {runState.youtubeMetadata && (
                        <div className={`rounded-lg border p-3 text-xs ${subtleBorder}`}>
                          <p className="font-semibold">
                            Metadata Upload YouTube ({runState.youtubeMetadata.targetChannelName})
                          </p>
                          <p className="mt-1 font-medium">{runState.youtubeMetadata.seoTitle}</p>
                          <p className={`mt-1 whitespace-pre-line text-[11px] ${mutedText}`}>
                            {runState.youtubeMetadata.description}
                          </p>
                          <p className={`mt-1.5 font-mono text-[11px] ${mutedText}`}>
                            {runState.youtubeMetadata.hashtags.join(' ')} · Made for Kids:{' '}
                            {runState.youtubeMetadata.madeForKids ? 'Ya' : 'Tidak'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'routing' && (
          <div className="space-y-3">
            <div className={`rounded-xl border p-4 ${cardBg}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-bold">
                      Perutean 3 Kunci API Terpisah per Channel YouTube
                    </h3>
                    <p className={`mt-1 text-xs leading-relaxed ${mutedText}`}>
                      Setiap akun/channel YouTube memiliki slot variabel rahasia sendiri di server
                      (<strong>Settings &gt; Secrets</strong>) sehingga pemakaian kuota Gemini &amp;
                      ElevenLabs terpisah rapi dan tidak pernah dikirim ke browser. Jika slot khusus
                      channel belum diisi, server otomatis memakai kunci global.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenProviderSettings}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    isDark
                      ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                      : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  Buka Pengaturan AI
                </button>
              </div>

              <div className={`mt-3 divide-y rounded-lg border text-xs ${subtleBorder}`}>
                {(serverStatus?.channelRouting ?? []).map((slot) => (
                  <div key={slot.channelId} className="space-y-1.5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold">{slot.channelLabel}</span>
                      <span className={`text-[11px] ${mutedText}`}>Channel ID: {slot.channelId}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className={`rounded-md border px-2.5 py-2 ${subtleBorder}`}>
                        <p className="font-mono text-[11px] font-semibold">{slot.geminiEnvVar}</p>
                        <p
                          className={`mt-0.5 text-[11px] ${
                            slot.geminiSource === 'dedicated'
                              ? 'text-emerald-500'
                              : slot.geminiSource === 'fallback_global'
                              ? isDark
                                ? 'text-sky-400'
                                : 'text-sky-700'
                              : 'text-amber-500'
                          }`}
                        >
                          {slot.geminiSource === 'dedicated'
                            ? 'Aktif memakai kunci khusus channel'
                            : slot.geminiSource === 'fallback_global'
                            ? 'Memakai GEMINI_API_KEY global (fallback)'
                            : 'Belum terpasang di Settings > Secrets'}
                        </p>
                      </div>
                      <div className={`rounded-md border px-2.5 py-2 ${subtleBorder}`}>
                        <p className="font-mono text-[11px] font-semibold">
                          {slot.elevenLabsEnvVar}
                        </p>
                        <p
                          className={`mt-0.5 text-[11px] ${
                            slot.elevenLabsSource === 'dedicated'
                              ? 'text-emerald-500'
                              : slot.elevenLabsSource === 'fallback_global'
                              ? isDark
                                ? 'text-sky-400'
                                : 'text-sky-700'
                              : mutedText
                          }`}
                        >
                          {slot.elevenLabsSource === 'dedicated'
                            ? 'Aktif memakai kunci khusus channel'
                            : slot.elevenLabsSource === 'fallback_global'
                            ? 'Memakai ELEVENLABS_API_KEY global (fallback)'
                            : 'Opsional — tambahkan di Settings > Secrets'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
