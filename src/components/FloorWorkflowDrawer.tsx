import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cloud,
  Compass,
  ExternalLink,
  Eye,
  KeyRound,
  Layers,
  Loader2,
  Mic,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Tv,
  Upload,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import {
  BUILDING_FLOORS,
  FLOOR_ORDER,
  type BuildingSimulationState,
  type FloorId,
} from '../office/buildingFloors';
import {
  BIBLE_FACT_CATEGORIES,
  buildBibleChapterStoryPlan,
  type BibleFactCategory,
  type BibleFactResearchResult,
  type BiblePlanScopeType,
  type BibleSeriesPlanSummary,
} from '../office/floor2And3Workflows';
import { buildFloorWorkflowSnapshot } from '../office/floorWorkflowView';
import {
  formatDurationLabelId,
  type MasterBibleSyncMode,
} from '../office/masterBible';
import {
  PROTESTANT_BIBLE_BOOKS,
  lookupLocalBibleReference,
  type ChannelTemplatesMap,
  type LocalBibleDatabase,
  type ShortsQueueItem,
} from '../office/shortsFactory';
import type { AgentId, LightingPreset, TaskEntry } from '../office/types';
import type { OrchestratorPrefill } from './ProductionOrchestratorDrawer';

interface DevotionalResearchResult {
  dateLabel: string;
  title: string;
  bibleReference: string;
  sourceName: string;
  coreSummary: string;
  visualMood: string;
  recommendedCommand: string;
  sourceLinks: Array<{ title: string; uri: string }>;
  matchedMasterVerses: Array<{ ref: string; text: string }>;
  masterBibleActive: boolean;
  keySlotUsed: string;
}

interface FloorWorkflowDrawerProps {
  floorId: FloorId;
  buildingState: BuildingSimulationState;
  lighting: LightingPreset;
  shortsQueue: ShortsQueueItem[];
  channelTemplates: ChannelTemplatesMap;
  tasksByFloorAgent: Record<string, TaskEntry[]>;
  masterBible: LocalBibleDatabase | null;
  masterBibleBusy: boolean;
  masterBibleError: string | null;
  masterBibleSyncMode?: MasterBibleSyncMode;
  masterBibleSyncNotice?: string | null;
  firebaseSignedIn?: boolean;
  onOpenFirebaseAuth?: () => void;
  onUploadMasterBibleFile: (file: File) => Promise<void>;
  onClearMasterBible: () => Promise<void>;
  onSelectFloorTab: (floorId: FloorId) => void;
  onFocusEmployeeIn3D: (floorId: FloorId, agentId: AgentId) => void;
  onOpenOrchestratorForFloor: (floorId: FloorId, prefill?: Omit<OrchestratorPrefill, 'nonce'>) => void;
  onOpenFloorDashboard: (floorId: FloorId) => void;
  onOpenChannelTemplates: () => void;
  onDevotionalResearchEvent?: (phase: 'start' | 'done' | 'error', detail: string) => void;
  onClose: () => void;
}

export function FloorWorkflowDrawer({
  floorId,
  buildingState,
  lighting,
  shortsQueue,
  channelTemplates,
  tasksByFloorAgent,
  masterBible,
  masterBibleBusy,
  masterBibleError,
  masterBibleSyncMode = 'server-synced',
  masterBibleSyncNotice = null,
  firebaseSignedIn = false,
  onOpenFirebaseAuth,
  onUploadMasterBibleFile,
  onClearMasterBible,
  onSelectFloorTab,
  onFocusEmployeeIn3D,
  onOpenOrchestratorForFloor,
  onOpenFloorDashboard,
  onOpenChannelTemplates,
  onDevotionalResearchEvent,
  onClose,
}: FloorWorkflowDrawerProps) {
  const isDark = lighting === 'malam';
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [verseQuery, setVerseQuery] = useState<string>('Mazmur 27:14');
  // Lantai 1: Daily Faith & Inspiration valid source research state
  const [researchTopicHint, setResearchTopicHint] = useState<string>('');
  const [researchLoading, setResearchLoading] = useState<boolean>(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchResult, setResearchResult] = useState<DevotionalResearchResult | null>(null);

  // Lantai 2: Bible Stories 3D (Kejadian 1 -> Wahyu 22 · 1 Pasal = 1 Cerita) planner state
  const [planScope, setPlanScope] = useState<BiblePlanScopeType>('old');
  const [planBookId, setPlanBookId] = useState<string>('kej');
  const [planStartIndex, setPlanStartIndex] = useState<number>(0);
  const [aiPlanOverride, setAiPlanOverride] = useState<BibleSeriesPlanSummary | null>(null);
  const [planLoading, setPlanLoading] = useState<boolean>(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Lantai 3: Bible Facts & Mysteries (Arkeologi, Ibrani/Yunani, Misteri) research state
  const [factCategory, setFactCategory] = useState<BibleFactCategory>('all');
  const [factTopicHint, setFactTopicHint] = useState<string>('');
  const [factLoading, setFactLoading] = useState<boolean>(false);
  const [factError, setFactError] = useState<string | null>(null);
  const [factResult, setFactResult] = useState<BibleFactResearchResult | null>(null);

  const localChapterPlan = useMemo(
    () =>
      buildBibleChapterStoryPlan({
        scopeType: planScope,
        bookId: planBookId,
        startIndex: planStartIndex,
        batchSize: 3,
      }),
    [planScope, planBookId, planStartIndex]
  );

  const activeChapterPlan =
    aiPlanOverride &&
    aiPlanOverride.scopeType === planScope &&
    aiPlanOverride.startIndex === planStartIndex &&
    (planScope !== 'book' || aiPlanOverride.episodes[0]?.bookId === planBookId)
      ? aiPlanOverride
      : localChapterPlan;

  const selectedFactCatObj = useMemo(
    () => BIBLE_FACT_CATEGORIES.find((c) => c.id === factCategory) ?? BIBLE_FACT_CATEGORIES[0],
    [factCategory]
  );

  const snapshot = useMemo(
    () =>
      buildFloorWorkflowSnapshot({
        floorId,
        buildingState,
        shortsQueue,
        channelTemplates,
        tasksByFloorAgent,
      }),
    [floorId, buildingState, shortsQueue, channelTemplates, tasksByFloorAgent]
  );

  const verseLookup = useMemo(() => {
    if (!masterBible || !verseQuery.trim()) return null;
    return lookupLocalBibleReference(masterBible.versesMap, verseQuery.trim());
  }, [masterBible, verseQuery]);

  const { floorConfig, channelConfig, keyRouting, blueprint, template, stages, channelQueue, stats } =
    snapshot;

  const surfaceClass = isDark
    ? 'border-slate-700/90 bg-[#0f172a]/96 text-slate-100'
    : 'border-slate-200/95 bg-[#fcfbf8]/97 text-slate-900';

  const subCardClass = isDark
    ? 'border-slate-800 bg-slate-900/75 text-slate-100'
    : 'border-slate-200/90 bg-white text-slate-900';

  const mutedTextClass = isDark ? 'text-slate-400' : 'text-slate-600';
  const subtleBorderClass = isDark ? 'border-slate-800' : 'border-slate-200/80';

  const btnSecondaryClass = isDark
    ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100';

  const inputClass = isDark
    ? 'border-slate-700 bg-slate-950/80 text-slate-100 placeholder:text-slate-500'
    : 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400';

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      void onUploadMasterBibleFile(file);
    }
  };

  const handleRunDevotionalResearch = async () => {
    setResearchLoading(true);
    setResearchError(null);
    onDevotionalResearchEvent?.('start', researchTopicHint.trim() || 'Renungan harian valid (LAI)');
    try {
      const response = await fetch('/api/devotional/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicHint: researchTopicHint.trim() }),
      });
      const data = (await response.json()) as DevotionalResearchResult & { error?: string };
      if (!response.ok || data.error) {
        const msg = data.error || 'Gagal mencari sumber renungan harian valid.';
        setResearchError(msg);
        onDevotionalResearchEvent?.('error', msg);
        return;
      }
      setResearchResult(data);
      if (data.bibleReference) {
        setVerseQuery(data.bibleReference);
      }
      onDevotionalResearchEvent?.('done', `${data.title} (${data.bibleReference})`);
    } catch {
      const msg = 'Koneksi ke server riset renungan Lantai 1 terputus.';
      setResearchError(msg);
      onDevotionalResearchEvent?.('error', msg);
    } finally {
      setResearchLoading(false);
    }
  };

  const handleRunStoryPlanEnrich = async () => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const response = await fetch('/api/bible-stories/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scopeType: planScope,
          bookId: planBookId,
          startIndex: planStartIndex,
          batchSize: 3,
          enrichWithAi: true,
        }),
      });
      const data = (await response.json()) as {
        plan?: BibleSeriesPlanSummary;
        error?: string;
      };
      if (!response.ok || !data.plan) {
        setPlanError(data.error || 'Gagal menyusun detail cerita AI untuk batch pasal ini.');
        return;
      }
      setAiPlanOverride(data.plan);
    } catch {
      setPlanError('Koneksi ke server perencana Lantai 2 terputus.');
    } finally {
      setPlanLoading(false);
    }
  };

  const handleRunBibleFactResearch = async () => {
    setFactLoading(true);
    setFactError(null);
    try {
      const response = await fetch('/api/bible-facts/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: factCategory,
          topicHint: factTopicHint.trim(),
        }),
      });
      const data = (await response.json()) as BibleFactResearchResult & { error?: string };
      if (!response.ok || data.error) {
        setFactError(data.error || 'Gagal melakukan riset fakta & misteri Alkitab.');
        return;
      }
      setFactResult(data);
      if (data.bibleReference) {
        setVerseQuery(data.bibleReference);
      }
    } catch {
      setFactError('Koneksi ke server riset fakta Lantai 3 terputus.');
    } finally {
      setFactLoading(false);
    }
  };

  const isLantai1DailyFaith = floorId === 1;
  const isLantai2BibleStories = floorId === 2;
  const isLantai3BibleFacts = floorId === 3;

  return (
    <section
      aria-label={`Alur Kerja ${floorConfig.label} — ${floorConfig.channelName}`}
      data-testid={`floor-workflow-drawer-l${floorId}`}
      className={`pointer-events-auto mb-1 flex max-h-[calc(100vh-114px)] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border shadow-xl transition-colors ${surfaceClass}`}
    >
      {/* Header: Floor Identity, 3-Floor Quick Switcher & Primary Actions */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2.5 border-b px-4 py-2.5 ${subtleBorderClass}`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="h-3 w-3 shrink-0 rounded-xs"
            style={{ backgroundColor: floorConfig.accentHex }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-bold tracking-tight">
                {floorConfig.label} · {floorConfig.channelName}
              </h2>
              <span className={`font-mono text-[11px] tabular-nums ${mutedTextClass}`}>
                {stats.activeEmployees}/{stats.totalEmployees} aktif ({stats.utilizationPercent}%)
              </span>
              <span
                className={`font-mono text-[11px] font-semibold tabular-nums ${
                  isLantai1DailyFaith
                    ? isDark
                      ? 'text-amber-300'
                      : 'text-amber-700'
                    : isLantai2BibleStories
                    ? isDark
                      ? 'text-sky-300'
                      : 'text-blue-700'
                    : isDark
                    ? 'text-emerald-300'
                    : 'text-emerald-700'
                }`}
              >
                ·{' '}
                {isLantai1DailyFaith
                  ? `Target ${formatDurationLabelId(template.defaultDuration)}`
                  : isLantai2BibleStories
                  ? 'Target 2m 50d · 1 Pasal = 1 Cerita (17×10d)'
                  : 'Maks 2m 50d · Fakta & Misteri (17×10d)'}
              </span>
            </div>
            <p className={`truncate text-[11px] ${mutedTextClass}`}>
              {blueprint.workflowTitle} · {stages.length} tahap terstruktur (termasuk QC 2 Tahap)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick switch between L1 / L2 / L3 YouTube accounts */}
          <div
            className={`inline-flex items-center rounded-lg p-0.5 ${
              isDark ? 'bg-slate-800/90' : 'bg-slate-100'
            }`}
            role="tablist"
            aria-label="Pilih lantai akun YouTube"
          >
            {FLOOR_ORDER.map((fid) => {
              const cfg = BUILDING_FLOORS[fid];
              const active = fid === floorId;
              return (
                <button
                  key={fid}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-testid={`workflow-tab-l${fid}`}
                  onClick={() => onSelectFloorTab(fid)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? isDark
                        ? 'bg-slate-100 text-slate-950 font-semibold'
                        : 'bg-white text-slate-900 font-semibold shadow-xs'
                      : isDark
                      ? 'text-slate-300 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-xs"
                    style={{ backgroundColor: cfg.accentHex }}
                    aria-hidden="true"
                  />
                  <span>{cfg.shortLabel}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onOpenOrchestratorForFloor(floorId)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              isDark
                ? 'bg-slate-100 text-slate-950 hover:bg-white'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            <Workflow className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Orkestrator L{floorId}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenFloorDashboard(floorId)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${btnSecondaryClass}`}
          >
            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Tugaskan L{floorId}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup alur kerja lantai"
            className={`rounded-lg p-1.5 transition-colors ${
              isDark
                ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main Split Content: Left = 8-Stage Channel Workflow + L1 Valid Source Research, Right = Master Bible TB + Profile + Queue */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto px-4 py-3 lg:grid-cols-[1.58fr_1.08fr]">
        {/* Left Column: Ordered End-to-End Pipeline Blueprint for This Floor's YouTube Account */}
        <div className="flex min-h-0 flex-col gap-2.5">
          {/* Lantai 1 Dedicated Devotional Research Bar (LAI / Sumber Valid -> 2m 50d Production) */}
          {isLantai1DailyFaith && (
            <div
              data-testid="l1-devotional-research-box"
              className={`rounded-xl border px-3.5 py-2.5 ${
                isDark
                  ? 'border-amber-700/60 bg-amber-950/25 text-slate-100'
                  : 'border-amber-200 bg-amber-50/60 text-slate-900'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Search
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isDark ? 'text-amber-300' : 'text-amber-700'
                    }`}
                    aria-hidden="true"
                  />
                  <h3 className="text-xs font-bold">
                    Riset Renungan Harian Valid (LAI / Sumber Terpercaya · 2m 50d)
                  </h3>
                </div>
                <span className={`font-mono text-[10px] ${mutedTextClass}`}>
                  Google Search + Master Alkitab TB
                </span>
              </div>

              <div className="mt-2 flex flex-col gap-1.5 sm:flex-row">
                <input
                  type="text"
                  value={researchTopicHint}
                  onChange={(e) => setResearchTopicHint(e.target.value)}
                  placeholder="Tema renungan hari ini (opsional, mis. pengharapan, doa, damai)..."
                  className={`min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-[11px] focus:border-amber-500 focus:outline-none ${inputClass}`}
                />
                <button
                  type="button"
                  data-testid="l1-research-btn"
                  disabled={researchLoading}
                  onClick={() => void handleRunDevotionalResearch()}
                  className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                    isDark
                      ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                      : 'bg-amber-600 text-white hover:bg-amber-700'
                  }`}
                >
                  {researchLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{researchLoading ? 'Mencari Sumber Valid...' : 'Ambil Renungan Valid'}</span>
                </button>
              </div>

              {researchError && (
                <p className="mt-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-300">
                  {researchError}
                </p>
              )}

              {researchResult && (
                <div
                  className={`mt-2 rounded-lg border p-2.5 text-[11px] ${
                    isDark ? 'border-slate-700 bg-slate-900/90' : 'border-amber-200/90 bg-white'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold">{researchResult.title}</p>
                      <p className={`text-[10.5px] ${mutedTextClass}`}>
                        Ayat: <span className="font-semibold">{researchResult.bibleReference}</span> ·
                        Sumber: {researchResult.sourceName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenOrchestratorForFloor(1, {
                          channelId: 'daily-faith-inspiration',
                          command: researchResult.recommendedCommand,
                          bookScope: researchResult.bibleReference,
                          durationSeconds: 170,
                          sceneCount: 6,
                        })
                      }
                      className={`shrink-0 rounded-md px-2.5 py-1 text-[10.5px] font-semibold transition-colors ${
                        isDark
                          ? 'bg-slate-100 text-slate-950 hover:bg-white'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      Produksi 2m 50d Sekarang
                    </button>
                  </div>
                  <p className={`mt-1 leading-snug ${mutedTextClass}`}>
                    {researchResult.coreSummary}
                  </p>
                  <p className={`mt-1 text-[10.5px] ${mutedTextClass}`}>
                    <span className="font-semibold">Animasi Latar:</span> {researchResult.visualMood}
                  </p>
                  {researchResult.matchedMasterVerses.length > 0 && (
                    <div
                      className={`mt-1.5 rounded-md border px-2 py-1 text-[10.5px] ${
                        isDark
                          ? 'border-emerald-800/70 bg-emerald-950/35 text-emerald-200'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      }`}
                    >
                      <span className="font-semibold">Verifikasi Master Alkitab TB: </span>
                      {researchResult.matchedMasterVerses
                        .slice(0, 2)
                        .map((v) => `${v.ref} "${v.text}"`)
                        .join(' ')}
                    </div>
                  )}
                  {researchResult.sourceLinks.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
                      <span className={mutedTextClass}>Rujukan Web:</span>
                      {researchResult.sourceLinks.slice(0, 3).map((link) => (
                        <a
                          key={link.uri}
                          href={link.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-0.5 underline-offset-2 hover:underline ${
                            isDark ? 'text-sky-300' : 'text-blue-700'
                          }`}
                        >
                          <span className="max-w-[160px] truncate">{link.title}</span>
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Lantai 2 Dedicated Planner: Kejadian 1 -> Wahyu 22 (1 Pasal = 1 Cerita · 17×10d) */}
          {isLantai2BibleStories && (
            <div
              data-testid="l2-story-planner-box"
              className={`rounded-xl border px-3.5 py-2.5 ${
                isDark
                  ? 'border-blue-700/60 bg-blue-950/25 text-slate-100'
                  : 'border-blue-200 bg-blue-50/55 text-slate-900'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <BookOpen
                    className={`h-3.5 w-3.5 shrink-0 ${isDark ? 'text-sky-300' : 'text-blue-700'}`}
                    aria-hidden="true"
                  />
                  <h3 className="text-xs font-bold">
                    Perencana Seri Alkitab (Kejadian 1 → Wahyu 22 · 1 Pasal = 1 Cerita)
                  </h3>
                </div>
                <span className="font-mono text-[10.5px] font-semibold tabular-nums">
                  {activeChapterPlan.totalStories.toLocaleString('id-ID')} cerita ·{' '}
                  {activeChapterPlan.bookCount} kitab
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'old', label: 'Perjanjian Lama (929)' },
                    { id: 'new', label: 'Perjanjian Baru (260)' },
                    { id: 'all', label: 'Seluruh Alkitab (1.189)' },
                    { id: 'book', label: 'Per Kitab' },
                  ] as Array<{ id: BiblePlanScopeType; label: string }>
                ).map((opt) => {
                  const active = planScope === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={`l2-scope-${opt.id}`}
                      onClick={() => {
                        setPlanScope(opt.id);
                        setPlanStartIndex(0);
                        setAiPlanOverride(null);
                        setPlanError(null);
                      }}
                      className={`rounded-md border px-2 py-1 text-[10.5px] font-semibold transition-colors ${
                        active
                          ? isDark
                            ? 'border-sky-400 bg-sky-500 text-slate-950'
                            : 'border-blue-700 bg-blue-700 text-white'
                          : btnSecondaryClass
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}

                {planScope === 'book' && (
                  <select
                    aria-label="Pilih kitab Alkitab"
                    value={planBookId}
                    onChange={(e) => {
                      setPlanBookId(e.target.value);
                      setPlanStartIndex(0);
                      setAiPlanOverride(null);
                    }}
                    className={`rounded-md border px-2 py-1 text-[10.5px] font-medium focus:border-blue-500 focus:outline-none ${inputClass}`}
                  >
                    {PROTESTANT_BIBLE_BOOKS.map((book) => (
                      <option key={book.id} value={book.id}>
                        {book.name} ({book.chapterCount} pasal)
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  data-testid="l2-enrich-ai-btn"
                  disabled={planLoading}
                  onClick={() => void handleRunStoryPlanEnrich()}
                  className={`ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10.5px] font-semibold transition-colors disabled:opacity-60 ${
                    isDark
                      ? 'bg-slate-100 text-slate-950 hover:bg-white'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {planLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                  )}
                  <span>{planLoading ? 'Merencanakan...' : 'Rencanakan Detail AI'}</span>
                </button>
              </div>

              {planError && (
                <p className="mt-1.5 text-[10.5px] font-medium text-rose-600 dark:text-rose-300">
                  {planError}
                </p>
              )}

              <div className="mt-2 space-y-1.5">
                {activeChapterPlan.episodes.map((ep) => (
                  <div
                    key={`${ep.bookId}-${ep.chapterNumber}`}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                      isDark ? 'border-slate-700/80 bg-slate-900/90' : 'border-blue-200/80 bg-white'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold tabular-nums text-blue-600 dark:text-sky-300">
                          #{ep.episodeNumber}/{ep.totalEpisodesInScope}
                        </span>
                        <span className="truncate font-bold">{ep.storyTitle}</span>
                        <span className={`font-mono text-[10px] ${mutedTextClass}`}>
                          · {ep.reference} · 17×10d
                        </span>
                      </div>
                      <p className={`mt-0.5 truncate text-[10px] ${mutedTextClass}`}>
                        {ep.continuityNote} · {ep.dialogueHighlight}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid={`l2-produce-ep-${ep.episodeNumber}`}
                      onClick={() =>
                        onOpenOrchestratorForFloor(2, {
                          channelId: 'bible-stories-3d',
                          command: ep.recommendedCommand,
                          bookScope: ep.reference,
                          durationSeconds: 170,
                          sceneCount: 17,
                        })
                      }
                      className={`shrink-0 rounded-md px-2.5 py-1 text-[10.5px] font-semibold transition-colors ${
                        isDark
                          ? 'bg-sky-500 text-slate-950 hover:bg-sky-400'
                          : 'bg-blue-700 text-white hover:bg-blue-800'
                      }`}
                    >
                      Produksi 17×10d
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-1.5 flex items-center justify-between text-[10.5px]">
                <span className={mutedTextClass}>
                  Menampilkan cerita #{planStartIndex + 1}–
                  {Math.min(planStartIndex + 3, activeChapterPlan.totalStories)} dari{' '}
                  {activeChapterPlan.totalStories.toLocaleString('id-ID')} · Dialog masuk narasi audio
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={planStartIndex === 0}
                    onClick={() => {
                      setPlanStartIndex((prev) => Math.max(0, prev - 3));
                      setAiPlanOverride(null);
                    }}
                    aria-label="Batch pasal sebelumnya"
                    className={`inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[10px] font-medium disabled:opacity-40 ${btnSecondaryClass}`}
                  >
                    <ChevronLeft className="h-3 w-3" aria-hidden="true" />
                    <span>Sebelumnya</span>
                  </button>
                  <button
                    type="button"
                    disabled={planStartIndex + 3 >= activeChapterPlan.totalStories}
                    onClick={() => {
                      setPlanStartIndex((prev) =>
                        Math.min(Math.max(0, activeChapterPlan.totalStories - 3), prev + 3)
                      );
                      setAiPlanOverride(null);
                    }}
                    aria-label="Batch pasal berikutnya"
                    className={`inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[10px] font-medium disabled:opacity-40 ${btnSecondaryClass}`}
                  >
                    <span>Berikutnya</span>
                    <ChevronRight className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Lantai 3 Dedicated Researcher: Bukti Peninggalan, Kata Ibrani/Yunani & Misteri (Maks 2m 50d) */}
          {isLantai3BibleFacts && (
            <div
              data-testid="l3-facts-research-box"
              className={`rounded-xl border px-3.5 py-2.5 ${
                isDark
                  ? 'border-emerald-700/60 bg-emerald-950/25 text-slate-100'
                  : 'border-emerald-200 bg-emerald-50/55 text-slate-900'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Compass
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isDark ? 'text-emerald-300' : 'text-emerald-700'
                    }`}
                    aria-hidden="true"
                  />
                  <h3 className="text-xs font-bold">
                    Riset Fakta, Bukti Peninggalan &amp; Kata Ibrani/Yunani (Maks 2m 50d)
                  </h3>
                </div>
                <span className={`font-mono text-[10px] ${mutedTextClass}`}>
                  Google Search + Master Alkitab TB
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {BIBLE_FACT_CATEGORIES.map((cat) => {
                  const active = factCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      data-testid={`l3-cat-${cat.id}`}
                      onClick={() => setFactCategory(cat.id)}
                      className={`rounded-md border px-2 py-0.5 text-[10.5px] font-semibold transition-colors ${
                        active
                          ? isDark
                            ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                            : 'border-emerald-700 bg-emerald-700 text-white'
                          : btnSecondaryClass
                      }`}
                    >
                      {cat.shortLabel}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 flex flex-col gap-1.5 sm:flex-row">
                <input
                  type="text"
                  value={factTopicHint}
                  onChange={(e) => setFactTopicHint(e.target.value)}
                  placeholder={`Contoh: ${selectedFactCatObj.exampleTopic}`}
                  className={`min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-[11px] focus:border-emerald-500 focus:outline-none ${inputClass}`}
                />
                <button
                  type="button"
                  data-testid="l3-research-btn"
                  disabled={factLoading}
                  onClick={() => void handleRunBibleFactResearch()}
                  className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                    isDark
                      ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                      : 'bg-emerald-700 text-white hover:bg-emerald-800'
                  }`}
                >
                  {factLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Search className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{factLoading ? 'Meriset Fakta...' : 'Cari Fakta & Misteri'}</span>
                </button>
              </div>

              {factError && (
                <p className="mt-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-300">
                  {factError}
                </p>
              )}

              {factResult && (
                <div
                  className={`mt-2 rounded-lg border p-2.5 text-[11px] ${
                    isDark ? 'border-slate-700 bg-slate-900/90' : 'border-emerald-200/90 bg-white'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold">{factResult.title}</p>
                      <p className={`text-[10.5px] ${mutedTextClass}`}>
                        Ayat: <span className="font-semibold">{factResult.bibleReference}</span> ·{' '}
                        {factResult.evidenceType}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenOrchestratorForFloor(3, {
                          channelId: 'bible-facts-mysteries',
                          command: factResult.recommendedCommand,
                          bookScope: factResult.bibleReference,
                          durationSeconds: 170,
                          sceneCount: 17,
                        })
                      }
                      className={`shrink-0 rounded-md px-2.5 py-1 text-[10.5px] font-semibold transition-colors ${
                        isDark
                          ? 'bg-slate-100 text-slate-950 hover:bg-white'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      Produksi Fakta 17×10d
                    </button>
                  </div>

                  {factResult.originalTerm && (
                    <div
                      className={`mt-1.5 rounded-md border px-2 py-1 text-[10.5px] ${
                        isDark
                          ? 'border-sky-800/70 bg-sky-950/35 text-sky-200'
                          : 'border-sky-200 bg-sky-50 text-sky-900'
                      }`}
                    >
                      <span className="font-bold">
                        Kata Asli: {factResult.originalTerm}
                        {factResult.transliteration ? ` (${factResult.transliteration})` : ''}
                      </span>
                      {factResult.commonMisconception && (
                        <span> · Salah kaprah: {factResult.commonMisconception}</span>
                      )}
                      {factResult.trueMeaning && (
                        <span> · Makna asli: {factResult.trueMeaning}</span>
                      )}
                    </div>
                  )}

                  <p className={`mt-1 leading-snug ${mutedTextClass}`}>{factResult.coreSummary}</p>
                  <p className={`mt-1 text-[10.5px] ${mutedTextClass}`}>
                    <span className="font-semibold">Bukti / Arkeologi:</span>{' '}
                    {factResult.archaeologicalEvidence}
                  </p>
                  <p className={`mt-1 text-[10.5px] ${mutedTextClass}`}>
                    <span className="font-semibold">Visual Animasi Menyerupai Objek:</span>{' '}
                    {factResult.visualReconstructionBrief}
                  </p>

                  {factResult.matchedMasterVerses.length > 0 && (
                    <div
                      className={`mt-1.5 rounded-md border px-2 py-1 text-[10.5px] ${
                        isDark
                          ? 'border-emerald-800/70 bg-emerald-950/35 text-emerald-200'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      }`}
                    >
                      <span className="font-semibold">Verifikasi Master Alkitab TB: </span>
                      {factResult.matchedMasterVerses
                        .slice(0, 2)
                        .map((v) => `${v.ref} "${v.text}"`)
                        .join(' ')}
                    </div>
                  )}

                  {factResult.sourceLinks.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
                      <span className={mutedTextClass}>Rujukan Web:</span>
                      {factResult.sourceLinks.slice(0, 3).map((link) => (
                        <a
                          key={link.uri}
                          href={link.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-0.5 underline-offset-2 hover:underline ${
                            isDark ? 'text-sky-300' : 'text-blue-700'
                          }`}
                        >
                          <span className="max-w-[160px] truncate">{link.title}</span>
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className={`rounded-xl border px-3.5 py-2 ${subCardClass}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: floorConfig.accentHex }}
                  aria-hidden="true"
                />
                <h3 className="text-xs font-bold tracking-tight">
                  Peta Alur Kerja Produksi — {channelConfig.name}
                </h3>
              </div>
              <span className={`font-mono text-[10.5px] ${mutedTextClass}`}>
                {blueprint.defaultBookScope}
              </span>
            </div>
            <p className={`mt-0.5 text-[11px] leading-snug ${mutedTextClass}`}>
              {blueprint.summary}
            </p>
          </div>

          <ol
            aria-label={`Daftar ${stages.length} tahap alur kerja ${channelConfig.name}`}
            className="space-y-1.5 overflow-y-auto pr-0.5 lg:max-h-[252px]"
          >
            {stages.map((stage, index) => {
              const lead = stage.leadEmployee;
              const isLast = index === stages.length - 1;
              const statusTone =
                lead.hasActiveTask || lead.activity === 'executing_task'
                  ? isDark
                    ? 'text-sky-300'
                    : 'text-blue-700'
                  : lead.activity === 'working' ||
                    lead.activity === 'meeting' ||
                    lead.activity === 'server_check'
                  ? isDark
                    ? 'text-emerald-300'
                    : 'text-emerald-700'
                  : isDark
                  ? 'text-amber-300'
                  : 'text-amber-700';

              return (
                <li
                  key={stage.id}
                  data-testid={`workflow-stage-${stage.order}`}
                  className={`rounded-xl border px-3 py-2 transition-colors ${subCardClass}`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-bold text-white tabular-nums"
                        style={{ backgroundColor: floorConfig.accentHex }}
                      >
                        {String(stage.order).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-xs font-semibold leading-snug">{stage.title}</span>
                          <span className={`text-[10px] font-medium ${mutedTextClass}`}>
                            · {stage.phaseLabel}
                          </span>
                        </div>
                        <p className={`mt-0.5 text-[11px] leading-snug ${mutedTextClass}`}>
                          {stage.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`text-[10px] font-medium ${
                          isDark ? 'text-slate-300' : 'text-slate-700'
                        }`}
                      >
                        Output: {stage.deliverableLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => onFocusEmployeeIn3D(floorId, lead.agentId)}
                        title={`Fokus kamera 3D ke ${lead.name} di Lantai ${floorId}`}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors ${btnSecondaryClass}`}
                      >
                        <Eye className="h-3 w-3" aria-hidden="true" />
                        <span>Fokus {lead.shortName}</span>
                      </button>
                    </div>
                  </div>

                  {/* Stage Lead Employee, Support Team & API Key Slot */}
                  <div
                    className={`mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-1.5 text-[10px] ${subtleBorderClass}`}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Users className="h-3 w-3 opacity-70" aria-hidden="true" />
                        <span>
                          {lead.name} ({lead.role})
                        </span>
                      </span>
                      <span className={`font-medium ${statusTone}`}>· {lead.activityLabel}</span>
                      {stage.supportEmployees.length > 0 && (
                        <span className={mutedTextClass}>
                          · Pendukung: {stage.supportEmployees.map((s) => s.shortName).join(', ')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 font-mono text-[10px] ${mutedTextClass}`}
                      >
                        {stage.id === 'narration_audio' ? (
                          <Mic className="h-2.5 w-2.5" aria-hidden="true" />
                        ) : (
                          <KeyRound className="h-2.5 w-2.5" aria-hidden="true" />
                        )}
                        <span>{stage.apiSlotLabel}</span>
                      </span>
                      {!isLast && (
                        <ArrowRight
                          className={`h-3 w-3 ${mutedTextClass} opacity-60`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Right Column: Building-Wide Master Bible TB Upload + Channel Profile + Scoped Queue */}
        <div className="flex flex-col gap-2.5">
          {/* Building-Wide Master Alkitab Terjemahan Baru (TB) Upload & Guardrail Card */}
          <div
            data-testid="master-bible-card"
            className={`rounded-xl border p-3 ${
              masterBible
                ? isDark
                  ? 'border-emerald-700/70 bg-emerald-950/25 text-slate-100'
                  : 'border-emerald-200 bg-emerald-50/55 text-slate-900'
                : subCardClass
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {masterBible ? (
                    <ShieldCheck
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isDark ? 'text-emerald-300' : 'text-emerald-700'
                      }`}
                      aria-hidden="true"
                    />
                  ) : (
                    <BookMarked
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: floorConfig.accentHex }}
                      aria-hidden="true"
                    />
                  )}
                  <h3 className="text-xs font-bold">
                    Master Alkitab Terjemahan Baru (Wajib L1–L3)
                  </h3>
                </div>
                <p className={`mt-0.5 text-[10.5px] leading-snug ${mutedTextClass}`}>
                  {masterBible
                    ? `${masterBible.report.sourceName} · ${masterBible.report.bookCount} kitab · ${masterBible.report.indexedVerseCount.toLocaleString('id-ID')} ayat aktif untuk seluruh lantai.`
                    : 'Unggah 1 file Alkitab Terjemahan Baru (.json / .txt) agar seluruh 39 agen di L1, L2 & L3 wajib menjadikan Alkitab sebagai sumber utama.'}
                </p>
              </div>
              {masterBible && (
                <button
                  type="button"
                  onClick={() => void onClearMasterBible()}
                  title="Hapus Master Alkitab lokal"
                  className={`rounded-md p-1 transition-colors ${
                    isDark
                      ? 'text-slate-400 hover:bg-slate-800 hover:text-rose-300'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-rose-600'
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.txt,application/json,text/plain"
              onChange={handleFileChange}
              className="hidden"
              data-testid="master-bible-file-input"
            />

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-testid="upload-master-bible-btn"
                disabled={masterBibleBusy}
                onClick={() => fileInputRef.current?.click()}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                  masterBible
                    ? btnSecondaryClass
                    : isDark
                    ? 'border-sky-500/60 bg-sky-600 text-white hover:bg-sky-500'
                    : 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {masterBibleBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>
                  {masterBibleBusy
                    ? 'Memproses Alkitab...'
                    : masterBible
                    ? 'Ganti File Alkitab TB'
                    : 'Upload Alkitab TB (.json / .txt)'}
                </span>
              </button>

              {masterBible && (
                <span
                  data-testid="master-bible-sync-status"
                  className={`inline-flex items-center gap-1 text-[10.5px] font-semibold ${
                    isDark ? 'text-emerald-300' : 'text-emerald-700'
                  }`}
                >
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  <span>
                    {masterBibleSyncMode === 'firebase-synced'
                      ? 'Tersimpan di Firebase Firestore (L1–L3)'
                      : masterBibleSyncMode === 'local-only'
                      ? 'Aktif di Browser L1–L3 (Mode Lokal/Netlify)'
                      : 'Tersinkron ke L1, L2 & L3'}
                  </span>
                </span>
              )}

              {masterBible && masterBibleSyncMode !== 'firebase-synced' && onOpenFirebaseAuth && (
                <button
                  type="button"
                  data-testid="save-master-bible-firebase-btn"
                  onClick={onOpenFirebaseAuth}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10.5px] font-semibold transition-colors ${
                    isDark
                      ? 'border-amber-500/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                      : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  <Cloud className="h-3 w-3" aria-hidden="true" />
                  <span>{firebaseSignedIn ? 'Sinkronkan Firebase' : 'Simpan ke Firebase'}</span>
                </button>
              )}
            </div>

            {masterBible && masterBibleSyncNotice && !masterBibleError && (
              <p
                data-testid="master-bible-sync-notice"
                className={`mt-1.5 text-[10px] leading-snug ${mutedTextClass}`}
              >
                {masterBibleSyncNotice}
              </p>
            )}

            {masterBibleError && (
              <p
                data-testid="master-bible-error"
                className="mt-1.5 text-[10.5px] font-medium text-rose-600 dark:text-rose-300"
              >
                {masterBibleError}
              </p>
            )}

            {/* Instant TB Verse Verifier when Master Bible is uploaded */}
            {masterBible && (
              <div className={`mt-2 border-t pt-2 ${subtleBorderClass}`}>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={verseQuery}
                    onChange={(e) => setVerseQuery(e.target.value)}
                    placeholder="Uji ayat TB (misal: Mazmur 27:14)"
                    className={`min-w-0 flex-1 rounded-md border px-2 py-1 text-[10.5px] focus:border-emerald-500 focus:outline-none ${inputClass}`}
                  />
                </div>
                {verseLookup && verseLookup.verses.length > 0 ? (
                  <p className="mt-1 text-[10.5px] leading-snug">
                    <span className="font-semibold">{verseLookup.verses[0].ref}:</span>{' '}
                    “{verseLookup.verses[0].text}”
                  </p>
                ) : (
                  verseQuery.trim() && (
                    <p className={`mt-1 text-[10px] ${mutedTextClass}`}>
                      Referensi “{verseQuery}” belum ditemukan pada file yang diunggah.
                    </p>
                  )
                )}
              </div>
            )}
          </div>

          {/* Channel Identity & Floor API Key Routing */}
          <div className={`rounded-xl border p-3 ${subCardClass}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Tv
                  className="h-3.5 w-3.5"
                  style={{ color: floorConfig.accentHex }}
                  aria-hidden="true"
                />
                <h3 className="text-xs font-bold">Profil Akun YouTube Lantai {floorId}</h3>
              </div>
              <button
                type="button"
                onClick={onOpenChannelTemplates}
                className={`text-[11px] font-medium underline-offset-2 hover:underline ${
                  isDark ? 'text-sky-300' : 'text-blue-700'
                }`}
              >
                Ubah Template
              </button>
            </div>

            <dl className="mt-2 space-y-1 text-[11px]">
              <div className="flex items-start justify-between gap-2">
                <dt className={mutedTextClass}>Nama Channel</dt>
                <dd className="text-right font-semibold">{channelConfig.name}</dd>
              </div>
              <div className="flex items-start justify-between gap-2">
                <dt className={mutedTextClass}>Durasi Narasi</dt>
                <dd className="font-mono font-semibold tabular-nums">
                  {formatDurationLabelId(template.defaultDuration)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-2">
                <dt className={mutedTextClass}>Karakter Suara</dt>
                <dd className="text-right">{keyRouting.voicePresetName}</dd>
              </div>
              <div className="flex items-start justify-between gap-2">
                <dt className={mutedTextClass}>Rute API L{floorId}</dt>
                <dd className="truncate font-mono text-[10px]">{floorConfig.geminiEnvVar}</dd>
              </div>
            </dl>
          </div>

          {/* Scoped Queue for This YouTube Channel */}
          <div className={`flex min-h-0 flex-1 flex-col rounded-xl border p-3 ${subCardClass}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Sparkles
                  className="h-3.5 w-3.5"
                  style={{ color: floorConfig.accentHex }}
                  aria-hidden="true"
                />
                <h3 className="text-xs font-bold">Antrean Konten Akun Ini</h3>
              </div>
              <span className={`font-mono text-[11px] tabular-nums ${mutedTextClass}`}>
                {stats.queueTotal} video · {stats.readyCount} siap
              </span>
            </div>

            <div className="mt-1.5 flex-1 space-y-1.5 overflow-y-auto lg:max-h-[120px]">
              {channelQueue.length === 0 ? (
                <p className={`py-2 text-center text-[11px] ${mutedTextClass}`}>
                  Belum ada proyek di antrean {channelConfig.name}.
                </p>
              ) : (
                channelQueue.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border px-2.5 py-1.5 ${
                      isDark
                        ? 'border-slate-800 bg-slate-950/60'
                        : 'border-slate-200/80 bg-slate-50/70'
                    }`}
                  >
                    <p className="truncate text-[11px] font-semibold">{item.title}</p>
                    <div
                      className={`mt-0.5 flex flex-wrap items-center justify-between gap-1 text-[10px] ${mutedTextClass}`}
                    >
                      <span>
                        {item.bibleReference} · {formatDurationLabelId(item.durationSeconds)}
                      </span>
                      <span className="font-medium">
                        {item.stage} · {item.guardianStatus}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className={`mt-2 flex flex-wrap gap-1.5 border-t pt-2 ${subtleBorderClass}`}>
              <button
                type="button"
                onClick={() => onOpenOrchestratorForFloor(floorId)}
                className={`flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  isDark
                    ? 'bg-slate-100 text-slate-950 hover:bg-white'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {isLantai1DailyFaith
                  ? 'Produksi Renungan 2m 50d'
                  : isLantai2BibleStories
                  ? 'Produksi Cerita 17×10d'
                  : 'Produksi Fakta 2m 50d'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${btnSecondaryClass}`}
              >
                Lihat 3D L{floorId}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
