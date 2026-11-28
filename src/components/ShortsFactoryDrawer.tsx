import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Film,
  HeartHandshake,
  ImagePlus,
  Layers,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tv,
  X,
} from 'lucide-react';
import type { LightingPreset } from '../office/types';
import { clearActiveApiWorkContext, setActiveApiWorkContext } from '../firebase/apiFetch';
import {
  PROTESTANT_BIBLE_BOOKS,
  PROTESTANT_BIBLE_GROUPS,
  YOUTUBE_CHANNELS,
  buildSrtFromScenes,
  canMarkReadyToPublish,
  computeScriptWordBudget,
  estimateSeriesEpisodes,
  extractIndonesianBibleReferences,
  getChannelById,
  getJakartaOperationStatus,
  lookupLocalBibleReference,
  validateChannelTemplate,
  validateShortsBrief,
  type BibleGroupId,
  type BibleSeriesEpisode,
  type CareFlag,
  type ChannelTemplateConfig,
  type ChannelTemplatesMap,
  type GuardianReport,
  type GuardianVerdict,
  type LocalBibleDatabase,
  type PastoralReport,
  type QueueStage,
  type ShortsChannelId,
  type ShortsDuration,
  type ShortsPackage,
  type ShortsQueueItem,
} from '../office/shortsFactory';

export type FactoryTab = 'produksi' | 'templates' | 'guardian' | 'channels';
type PackageSubTab = 'naskah' | 'storyboard' | 'guardian' | 'seo';

export interface ShortsBriefPrefill {
  channelId: ShortsChannelId;
  title: string;
  bibleReference: string;
  durationSeconds: ShortsDuration;
  notes: string;
  nonce: number;
}

export interface ShortsProductionEvent {
  runId?: string;
  phase: 'start' | 'done' | 'error';
  channelName: string;
  title: string;
  guardianStatus?: GuardianVerdict;
}

interface ShortsFactoryDrawerProps {
  lighting: LightingPreset;
  masterBible: LocalBibleDatabase | null;
  queue: ShortsQueueItem[];
  channelTemplates: ChannelTemplatesMap;
  externalTab?: FactoryTab;
  externalTabNonce?: number;
  prefillBrief?: ShortsBriefPrefill | null;
  onClose: () => void;
  onUpsertQueueItem: (item: ShortsQueueItem) => void;
  onUpdateQueueStage: (id: string, stage: QueueStage) => void;
  onSaveChannelTemplate: (template: ChannelTemplateConfig) => void;
  onResetChannelTemplate: (channelId: ShortsChannelId) => void;
  onProductionEvent: (ev: ShortsProductionEvent) => void;
  onHandoffToMediaStudio: (payload: {
    tab: 'video' | 'image';
    prompt: string;
    aspect: '9:16';
  }) => void;
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function verdictStyle(status: GuardianVerdict | 'BELUM DICEK', isDark: boolean): string {
  if (status === 'LULUS') {
    return isDark
      ? 'border-emerald-500/40 bg-emerald-950/70 text-emerald-300'
      : 'border-emerald-300 bg-emerald-50 text-emerald-800';
  }
  if (status === 'PERLU REVISI') {
    return isDark
      ? 'border-amber-500/40 bg-amber-950/70 text-amber-300'
      : 'border-amber-300 bg-amber-50 text-amber-800';
  }
  if (status === 'DITOLAK') {
    return isDark
      ? 'border-rose-500/40 bg-rose-950/70 text-rose-300'
      : 'border-rose-300 bg-rose-50 text-rose-800';
  }
  return isDark
    ? 'border-slate-700 bg-slate-800 text-slate-300'
    : 'border-slate-200 bg-slate-100 text-slate-600';
}

function careFlagMeta(flag: CareFlag): { label: string; tone: 'emerald' | 'amber' | 'rose' } {
  if (flag === 'urgent_safety') {
    return { label: 'Darurat Keselamatan (Butuh Perhatian Manusia)', tone: 'rose' };
  }
  if (flag === 'needs_human_care') {
    return { label: 'Perlu Tindak Lanjut Pastoral Manusia', tone: 'amber' };
  }
  return { label: 'Normal · Siap Disalin Manual', tone: 'emerald' };
}

export function ShortsFactoryDrawer({
  lighting,
  masterBible,
  queue,
  channelTemplates,
  externalTab,
  externalTabNonce,
  prefillBrief,
  onClose,
  onUpsertQueueItem,
  onUpdateQueueStage,
  onSaveChannelTemplate,
  onResetChannelTemplate,
  onProductionEvent,
  onHandoffToMediaStudio,
}: ShortsFactoryDrawerProps) {
  const isDark = lighting === 'malam';
  const [activeTab, setActiveTab] = useState<FactoryTab>(externalTab ?? 'produksi');

  useEffect(() => {
    if (externalTab) {
      setActiveTab(externalTab);
    }
  }, [externalTab, externalTabNonce]);

  // Production form state
  const [channelId, setChannelId] = useState<ShortsChannelId>('bible-stories-3d');
  const [title, setTitle] = useState('Daud dan Goliat: Iman Lebih Besar dari Raksasa');
  const [bibleReference, setBibleReference] = useState('1 Samuel 17:45-50');
  const [durationSeconds, setDurationSeconds] = useState<ShortsDuration>(
    channelTemplates['bible-stories-3d'].defaultDuration
  );
  const [notes, setNotes] = useState('Visual 3D hangat ramah keluarga, narasi jelas dan akurat.');
  const [activeQueueId, setActiveQueueId] = useState<string | null>('seed-bs3d-1');

  useEffect(() => {
    if (!prefillBrief) return;
    setChannelId(prefillBrief.channelId);
    setTitle(prefillBrief.title);
    setBibleReference(prefillBrief.bibleReference);
    setDurationSeconds(prefillBrief.durationSeconds);
    setNotes(prefillBrief.notes);
    setActiveQueueId(null);
    setActiveTab('produksi');
  }, [prefillBrief]);
  const [producing, setProducing] = useState(false);
  const [produceError, setProduceError] = useState<string | null>(null);
  const [activePackage, setActivePackage] = useState<ShortsPackage | null>(null);
  const [packageSubTab, setPackageSubTab] = useState<PackageSubTab>('naskah');

  // Template management state
  const [templateChannelId, setTemplateChannelId] = useState<ShortsChannelId>('bible-stories-3d');
  const [draftScriptTemplate, setDraftScriptTemplate] = useState<string>(
    channelTemplates['bible-stories-3d'].scriptTemplate
  );
  const [draftVisualStyle, setDraftVisualStyle] = useState<string>(
    channelTemplates['bible-stories-3d'].visualStyle
  );
  const [draftDefaultDuration, setDraftDefaultDuration] = useState<ShortsDuration>(
    channelTemplates['bible-stories-3d'].defaultDuration
  );
  const [draftClosingCta, setDraftClosingCta] = useState<string>(
    channelTemplates['bible-stories-3d'].closingCta
  );
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateSavedNotice, setTemplateSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    const tpl = channelTemplates[templateChannelId];
    setDraftScriptTemplate(tpl.scriptTemplate);
    setDraftVisualStyle(tpl.visualStyle);
    setDraftDefaultDuration(tpl.defaultDuration);
    setDraftClosingCta(tpl.closingCta);
    setTemplateError(null);
  }, [templateChannelId, channelTemplates]);

  // Standalone Guardian state
  const [guardianScript, setGuardianScript] = useState('');
  const [guardianRef, setGuardianRef] = useState('');
  const [guardianLoading, setGuardianLoading] = useState(false);
  const [guardianError, setGuardianError] = useState<string | null>(null);
  const [guardianResult, setGuardianResult] = useState<{
    theologicalGuardian: GuardianReport;
    pastoralSensitivity: PastoralReport;
    guardianGatePassed: boolean;
  } | null>(null);

  // Community / Prayer Manager state
  const [communityChannelId, setCommunityChannelId] =
    useState<ShortsChannelId>('daily-faith-inspiration');
  const [viewerComment, setViewerComment] = useState('');
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [communityResult, setCommunityResult] = useState<{
    reply: string;
    careFlag: CareFlag;
    note: string;
  } | null>(null);
  const [copiedReply, setCopiedReply] = useState(false);

  // 3-Channel Queue quick add state
  const [newIdeaChannel, setNewIdeaChannel] = useState<ShortsChannelId>('bible-stories-3d');
  const [newIdeaTitle, setNewIdeaTitle] = useState('');
  const [newIdeaRef, setNewIdeaRef] = useState('');

  // Bible Series 66-book Planner state
  const [selectedGroupId, setSelectedGroupId] = useState<BibleGroupId>('ot_torah');
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>(['kejadian']);
  const [seriesChannelId, setSeriesChannelId] = useState<ShortsChannelId>('bible-stories-3d');
  const [seriesDuration, setSeriesDuration] = useState<ShortsDuration>(45);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [seriesEpisodes, setSeriesEpisodes] = useState<BibleSeriesEpisode[]>([]);

  // Browser-local indo_tb.json state (never uploaded externally)

  const topicInputId = useId();
  const refInputId = useId();
  const tplScriptId = useId();
  const tplVisualId = useId();
  const tplCtaId = useId();

  const jakartaStatus = useMemo(() => getJakartaOperationStatus(), []);
  const fullCanonSummary = useMemo(() => estimateSeriesEpisodes(PROTESTANT_BIBLE_BOOKS), []);
  const selectedChannel = getChannelById(channelId);
  const activeChannelTemplate = channelTemplates[channelId];
  const wordBudget = computeScriptWordBudget(durationSeconds);
  const draftWordBudget = computeScriptWordBudget(draftDefaultDuration);

  const groupBooks = useMemo(
    () => PROTESTANT_BIBLE_BOOKS.filter((b) => b.groupId === selectedGroupId),
    [selectedGroupId]
  );

  const selectedBooks = useMemo(
    () => PROTESTANT_BIBLE_BOOKS.filter((b) => selectedBookIds.includes(b.id)),
    [selectedBookIds]
  );

  const selectedSeriesEstimate = useMemo(
    () => estimateSeriesEpisodes(selectedBooks),
    [selectedBooks]
  );

  const surfaceClass = isDark
    ? 'border-slate-700/90 bg-[#0f172a]/96 text-slate-100'
    : 'border-slate-200/95 bg-[#fcfbf8]/97 text-slate-900';
  const subtleBorder = isDark ? 'border-slate-800' : 'border-slate-200/90';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';
  const inputSurface = isDark
    ? 'border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500'
    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400';
  const segBg = isDark ? 'bg-slate-800/90' : 'bg-slate-200/80';
  const segActive = isDark
    ? 'bg-slate-100 text-slate-950 font-semibold'
    : 'bg-white text-slate-950 font-semibold shadow-xs';
  const segIdle = isDark
    ? 'text-slate-300 hover:text-white'
    : 'text-slate-600 hover:text-slate-950';
  const cardBg = isDark ? 'border-slate-800 bg-slate-900/85' : 'border-slate-200 bg-white';

  const buildLocalVerseContext = (scriptText: string, refText: string) => {
    if (!masterBible) return undefined;
    const refs = extractIndonesianBibleReferences(scriptText, refText);
    if (refs.length === 0) return undefined;
    const verses: Array<{ ref: string; text: string }> = [];
    const missingRefs: string[] = [];
    for (const ref of refs) {
      const lookup = lookupLocalBibleReference(masterBible.versesMap, ref);
      verses.push(...lookup.verses);
      missingRefs.push(...lookup.missingRefs);
    }
    return {
      sourceReady: true,
      sourceName: masterBible.report.sourceName,
      verses: verses.slice(0, 20),
      missingRefs: Array.from(new Set(missingRefs)),
    };
  };

  const handleRunPipeline = async (e: FormEvent) => {
    e.preventDefault();
    setProduceError(null);

    const check = validateShortsBrief({ channelId, title, durationSeconds });
    if (!check.ok) {
      setProduceError(check.error);
      return;
    }

    const ch = getChannelById(channelId);
    const jobId = activeQueueId ?? `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setActiveQueueId(jobId);

    onUpsertQueueItem({
      id: jobId,
      channelId,
      title: title.trim(),
      bibleReference: bibleReference.trim(),
      durationSeconds,
      notes: notes.trim(),
      stage: 'Dalam Produksi',
      guardianStatus: 'BELUM DICEK',
      updatedAt: new Date().toISOString(),
    });

    setProducing(true);
    setActiveApiWorkContext(jobId, channelId);
    onProductionEvent({ runId: jobId, phase: 'start', channelName: ch.name, title: title.trim() });

    try {
      const localVerseContext = buildLocalVerseContext(notes, bibleReference);
      const tpl = channelTemplates[channelId];
      const res = await fetch('/api/shorts/produce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          title: title.trim(),
          bibleReference: bibleReference.trim(),
          durationSeconds,
          notes: notes.trim(),
          localVerseContext,
          channelTemplate: {
            scriptTemplate: tpl.scriptTemplate,
            visualStyle: tpl.visualStyle,
            closingCta: tpl.closingCta,
          },
        }),
      });
      const data = (await res.json()) as { package?: ShortsPackage; error?: string };
      if (!res.ok || !data.package) {
        const errMsg = data.error ?? 'Pipeline produksi Shorts gagal dijalankan.';
        setProduceError(errMsg);
        onProductionEvent({ runId: jobId, phase: 'error', channelName: ch.name, title: title.trim() });
        return;
      }

      const pkg = data.package;
      setActivePackage(pkg);
      setPackageSubTab('naskah');

      const gatePassed = canMarkReadyToPublish(pkg);
      const overallGuardian: GuardianVerdict =
        pkg.theologicalGuardian.status === 'DITOLAK' ||
        pkg.pastoralSensitivity.status === 'DITOLAK'
          ? 'DITOLAK'
          : gatePassed
          ? 'LULUS'
          : 'PERLU REVISI';

      onUpsertQueueItem({
        id: jobId,
        channelId: pkg.channelId,
        title: pkg.title,
        bibleReference: pkg.bibleReference,
        durationSeconds: pkg.durationSeconds,
        notes: notes.trim(),
        stage: gatePassed ? 'Siap Publikasi' : 'Dalam Produksi',
        guardianStatus: overallGuardian,
        pkg,
        updatedAt: new Date().toISOString(),
      });

      onProductionEvent({
        runId: jobId,
        phase: 'done',
        channelName: ch.name,
        title: pkg.title,
        guardianStatus: overallGuardian,
      });
    } catch {
      setProduceError('Koneksi ke server Pabrik Shorts terputus.');
      onProductionEvent({ runId: jobId, phase: 'error', channelName: ch.name, title: title.trim() });
    } finally {
      clearActiveApiWorkContext(jobId);
      setProducing(false);
    }
  };

  const handleRunGuardian = async (e: FormEvent) => {
    e.preventDefault();
    setGuardianError(null);
    if (guardianScript.trim().length < 15) {
      setGuardianError('Tempelkan naskah minimal 15 karakter untuk diperiksa.');
      return;
    }

    setGuardianLoading(true);
    try {
      const localVerseContext = buildLocalVerseContext(guardianScript, guardianRef);
      const res = await fetch('/api/shorts/guardian', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: guardianScript.trim(),
          reference: guardianRef.trim(),
          localVerseContext,
        }),
      });
      const data = (await res.json()) as {
        theologicalGuardian?: GuardianReport;
        pastoralSensitivity?: PastoralReport;
        guardianGatePassed?: boolean;
        error?: string;
      };
      if (!res.ok || !data.theologicalGuardian || !data.pastoralSensitivity) {
        setGuardianError(data.error ?? 'Pemeriksaan Guardian gagal.');
        return;
      }
      setGuardianResult({
        theologicalGuardian: data.theologicalGuardian,
        pastoralSensitivity: data.pastoralSensitivity,
        guardianGatePassed: Boolean(data.guardianGatePassed),
      });
    } catch {
      setGuardianError('Koneksi ke layanan Guardian terputus.');
    } finally {
      setGuardianLoading(false);
    }
  };

  const handleRunCommunityReply = async (e: FormEvent) => {
    e.preventDefault();
    setCommunityError(null);
    setCopiedReply(false);
    if (viewerComment.trim().length < 4) {
      setCommunityError('Masukkan komentar atau permohonan doa pemirsa terlebih dahulu.');
      return;
    }

    setCommunityLoading(true);
    try {
      const res = await fetch('/api/shorts/community-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: communityChannelId,
          comment: viewerComment.trim(),
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        careFlag?: CareFlag;
        note?: string;
        error?: string;
      };
      if (!res.ok || !data.reply) {
        setCommunityError(data.error ?? 'Gagal menyusun draf balasan.');
        return;
      }
      setCommunityResult({
        reply: data.reply,
        careFlag: data.careFlag ?? 'normal',
        note: data.note ?? 'Salin manual ke YouTube Studio; tidak dikirim otomatis.',
      });
    } catch {
      setCommunityError('Koneksi ke Community Manager terputus.');
    } finally {
      setCommunityLoading(false);
    }
  };

  const handleCopyReply = async () => {
    if (!communityResult?.reply) return;
    try {
      await navigator.clipboard.writeText(communityResult.reply);
      setCopiedReply(true);
      setTimeout(() => setCopiedReply(false), 2000);
    } catch {
      setCopiedReply(false);
    }
  };

  const handleSaveTemplate = (e: FormEvent) => {
    e.preventDefault();
    setTemplateError(null);
    const check = validateChannelTemplate({
      channelId: templateChannelId,
      scriptTemplate: draftScriptTemplate,
      visualStyle: draftVisualStyle,
      defaultDuration: draftDefaultDuration,
      closingCta: draftClosingCta,
      updatedAt: new Date().toISOString(),
    });
    if (!check.ok) {
      setTemplateError(check.error);
      return;
    }
    onSaveChannelTemplate(check.value);
    if (channelId === templateChannelId) {
      setDurationSeconds(check.value.defaultDuration);
    }
    const ch = getChannelById(templateChannelId);
    setTemplateSavedNotice(`Template ${ch.shortLabel} (${check.value.defaultDuration}d) tersimpan.`);
    setTimeout(() => setTemplateSavedNotice(null), 2600);
  };

  const handleResetTemplate = () => {
    onResetChannelTemplate(templateChannelId);
    const ch = getChannelById(templateChannelId);
    if (channelId === templateChannelId) {
      setDurationSeconds(ch.defaultDuration);
    }
    setTemplateSavedNotice(`Template ${ch.shortLabel} dikembalikan ke default.`);
    setTimeout(() => setTemplateSavedNotice(null), 2600);
  };

  const handleAddQueueIdea = (e: FormEvent) => {
    e.preventDefault();
    if (newIdeaTitle.trim().length < 3) return;
    const ch = getChannelById(newIdeaChannel);
    const tpl = channelTemplates[newIdeaChannel];
    onUpsertQueueItem({
      id: `idea_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      channelId: newIdeaChannel,
      title: newIdeaTitle.trim(),
      bibleReference: newIdeaRef.trim(),
      durationSeconds: tpl.defaultDuration,
      notes: ch.focus,
      stage: 'Ide',
      guardianStatus: 'BELUM DICEK',
      updatedAt: new Date().toISOString(),
    });
    setNewIdeaTitle('');
    setNewIdeaRef('');
  };

  const handleLoadQueueToProducer = (item: ShortsQueueItem) => {
    setChannelId(item.channelId);
    setTitle(item.title);
    setBibleReference(item.bibleReference);
    setDurationSeconds(item.durationSeconds);
    setNotes(item.notes);
    setActiveQueueId(item.id);
    if (item.pkg) {
      setActivePackage(item.pkg);
    }
    setActiveTab('produksi');
  };

  const handleToggleBook = (bookId: string) => {
    setSelectedBookIds((prev) => {
      if (prev.includes(bookId)) {
        return prev.length > 1 ? prev.filter((id) => id !== bookId) : prev;
      }
      if (prev.length >= 5) {
        return [...prev.slice(1), bookId];
      }
      return [...prev, bookId];
    });
  };

  const handlePlanBibleSeries = async () => {
    setSeriesError(null);
    if (selectedBooks.length === 0) {
      setSeriesError('Pilih minimal 1 kitab dari kanon 66 kitab.');
      return;
    }
    setSeriesLoading(true);
    try {
      const groupObj = PROTESTANT_BIBLE_GROUPS.find((g) => g.id === selectedGroupId);
      const res = await fetch('/api/shorts/bible-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scopeLabel: groupObj?.label ?? 'Seri Alkitab',
          books: selectedBooks.map((b) => ({
            id: b.id,
            name: b.name,
            chapterCount: b.chapterCount,
          })),
          channelId: seriesChannelId,
          durationSeconds: seriesDuration,
        }),
      });
      const data = (await res.json()) as {
        episodes?: BibleSeriesEpisode[];
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.episodes)) {
        setSeriesError(data.error ?? 'Gagal menyusun rencana episode seri Alkitab.');
        return;
      }
      setSeriesEpisodes(data.episodes);
    } catch {
      setSeriesError('Koneksi ke perencana Seri Alkitab terputus.');
    } finally {
      setSeriesLoading(false);
    }
  };

  return (
    <section
      aria-label="Pabrik Konten YouTube Shorts 3 Channel"
      className={`pointer-events-auto mb-2 w-full rounded-xl border shadow-xl transition-colors duration-200 ${surfaceClass}`}
    >
      {/* Header Row */}
      <div
        className={`flex items-center justify-between gap-2 border-b px-3.5 py-2 ${subtleBorder}`}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold tracking-tight">
              Pabrik Konten YouTube Shorts
            </h2>
            <p className={`truncate text-[10.5px] ${mutedText}`}>
              3 Channel · Template Khusus · Guardian · Kanon 66 Kitab
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Modul Pabrik Shorts"
            className={`flex items-center gap-0.5 overflow-x-auto rounded-lg p-0.5 ${segBg}`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'produksi'}
              onClick={() => setActiveTab('produksi')}
              className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11.5px] whitespace-nowrap transition-colors ${
                activeTab === 'produksi' ? segActive : segIdle
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Produksi Shorts
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'templates'}
              onClick={() => {
                setTemplateChannelId(channelId);
                setActiveTab('templates');
              }}
              className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11.5px] whitespace-nowrap transition-colors ${
                activeTab === 'templates' ? segActive : segIdle
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              Manajemen Template
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'guardian'}
              onClick={() => setActiveTab('guardian')}
              className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11.5px] whitespace-nowrap transition-colors ${
                activeTab === 'guardian' ? segActive : segIdle
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Guardian &amp; Komunitas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'channels'}
              onClick={() => setActiveTab('channels')}
              className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11.5px] whitespace-nowrap transition-colors ${
                activeTab === 'channels' ? segActive : segIdle
              }`}
            >
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              3 Channel &amp; Alkitab
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup Pabrik Konten YouTube Shorts"
          className={`shrink-0 rounded-lg p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
            isDark
              ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
              : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="max-h-[380px] overflow-y-auto p-3.5">
        {activeTab === 'produksi' && (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-12">
            {/* Left: Brief Form */}
            <form onSubmit={handleRunPipeline} className="space-y-2.5 md:col-span-5">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wide opacity-75">
                  Pilih Channel YouTube (3 Channel)
                </span>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {YOUTUBE_CHANNELS.map((ch) => {
                    const active = channelId === ch.id;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => {
                          setChannelId(ch.id);
                          setDurationSeconds(channelTemplates[ch.id].defaultDuration);
                          setActiveQueueId(null);
                        }}
                        aria-pressed={active}
                        title={`${ch.name} — ${ch.focus}`}
                        className={`flex flex-col items-start rounded-lg border px-2 py-1.5 text-left transition-colors ${
                          active
                            ? isDark
                              ? 'border-blue-400 bg-slate-800 text-white'
                              : 'border-slate-900 bg-slate-900 text-white'
                            : cardBg
                        }`}
                      >
                        <div className="flex w-full items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-xs"
                            style={{ backgroundColor: ch.accentHex }}
                            aria-hidden="true"
                          />
                          <span className="truncate text-[11px] font-semibold">
                            {ch.shortLabel}
                          </span>
                        </div>
                        <span
                          className={`mt-0.5 line-clamp-1 text-[9.5px] ${
                            active ? 'text-slate-300' : mutedText
                          }`}
                        >
                          {ch.madeForKids ? 'Animasi 3D · Anak' : ch.shortLabel === 'Daily Faith' ? 'Renungan & Iman' : 'Fakta & Sejarah'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={topicInputId} className="text-xs font-semibold">
                    Topik / Judul Shorts
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const sample = selectedChannel.sampleTopics[0];
                      if (!sample) return;
                      setTitle(sample.title);
                      setBibleReference(sample.bibleReference);
                      setNotes(sample.notes);
                      setActiveQueueId(null);
                    }}
                    className={`text-[11px] font-medium underline-offset-2 hover:underline ${
                      isDark ? 'text-blue-400' : 'text-blue-700'
                    }`}
                  >
                    Isi Contoh Channel
                  </button>
                </div>
                <input
                  id={topicInputId}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Daud dan Goliat: Iman Lebih Besar dari Raksasa"
                  className={`mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none ${inputSurface}`}
                />
              </div>

              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-7">
                  <label htmlFor={refInputId} className="text-xs font-semibold">
                    Referensi Alkitab (Opsional)
                  </label>
                  <input
                    id={refInputId}
                    type="text"
                    value={bibleReference}
                    onChange={(e) => setBibleReference(e.target.value)}
                    placeholder="Contoh: 1 Samuel 17:45-50"
                    className={`mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none ${inputSurface}`}
                  />
                </div>
                <div className="col-span-5">
                  <span className="text-xs font-semibold">Durasi ({wordBudget.minWords}–{wordBudget.maxWords} kata)</span>
                  <div
                    role="group"
                    aria-label="Durasi Shorts"
                    className={`mt-1 flex items-center gap-0.5 rounded-lg p-0.5 ${segBg}`}
                  >
                    {([30, 45, 60] as ShortsDuration[]).map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => setDurationSeconds(dur)}
                        aria-pressed={durationSeconds === dur}
                        className={`flex-1 rounded-md py-1 font-mono text-[11px] tabular-nums transition-colors ${
                          durationSeconds === dur ? segActive : segIdle
                        }`}
                      >
                        {dur}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  aria-label="Catatan produksi"
                  placeholder="Catatan nada penyampaian, target pemirsa, atau arah visual 9:16..."
                  className={`w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none ${inputSurface}`}
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-[10px]">
                  <span className={`block truncate ${mutedText}`}>
                    Template: {selectedChannel.shortLabel} ({activeChannelTemplate.defaultDuration}d)
                    {' · '}
                    <button
                      type="button"
                      onClick={() => {
                        setTemplateChannelId(channelId);
                        setActiveTab('templates');
                      }}
                      className={`font-medium underline-offset-2 hover:underline ${
                        isDark ? 'text-blue-400' : 'text-blue-700'
                      }`}
                    >
                      Ubah Template
                    </button>
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={producing}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                    isDark
                      ? 'bg-blue-600 text-white hover:bg-blue-500'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {producing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Tim AI Memproduksi...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      Jalankan Pipeline 3D
                    </>
                  )}
                </button>
              </div>

              {produceError && (
                <div
                  role="alert"
                  className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                    isDark
                      ? 'border-rose-500/40 bg-rose-950/60 text-rose-200'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{produceError}</span>
                </div>
              )}
            </form>

            {/* Right: Output Package */}
            <div className="flex flex-col space-y-2.5 md:col-span-7">
              {!activePackage ? (
                <div
                  className={`flex h-full min-h-[250px] flex-col items-center justify-center rounded-lg border border-dashed p-5 text-center ${subtleBorder}`}
                >
                  <Tv className={`h-6 w-6 ${mutedText}`} aria-hidden="true" />
                  <h3 className="mt-2 text-xs font-semibold">
                    Paket Produksi YouTube Shorts Siap Dijalankan
                  </h3>
                  <p className={`mt-1 max-w-md text-xs leading-relaxed ${mutedText}`}>
                    Klik <strong>Jalankan Pipeline 3D</strong> untuk menggerakkan 5 agen kantor
                    menyusun riset, naskah terukur, storyboard vertikal 9:16 + Character Bible,
                    audit Theological Guardian &amp; Pastoral Checker, metadata SEO, dan file .SRT.
                  </p>
                </div>
              ) : (
                <div className={`rounded-lg border p-3 ${cardBg}`}>
                  {/* Package Top Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${verdictStyle(
                            activePackage.theologicalGuardian.status,
                            isDark
                          )}`}
                        >
                          Teologi: {activePackage.theologicalGuardian.status}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${verdictStyle(
                            activePackage.pastoralSensitivity.status,
                            isDark
                          )}`}
                        >
                          Pastoral: {activePackage.pastoralSensitivity.status}
                        </span>
                      </div>
                      <h3 className="mt-1 truncate text-xs font-bold">{activePackage.title}</h3>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const srt = buildSrtFromScenes(
                            activePackage.storyboard.scenes,
                            activePackage.durationSeconds
                          );
                          downloadTextFile(
                            `shorts-${activePackage.channelId}.srt`,
                            srt,
                            'text/plain;charset=utf-8'
                          );
                        }}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${subtleBorder}`}
                      >
                        <Download className="h-3 w-3" aria-hidden="true" />
                        Unduh SRT
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          downloadTextFile(
                            `paket-${activePackage.channelId}.json`,
                            JSON.stringify(activePackage, null, 2),
                            'application/json;charset=utf-8'
                          );
                        }}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${subtleBorder}`}
                      >
                        <Download className="h-3 w-3" aria-hidden="true" />
                        JSON
                      </button>
                    </div>
                  </div>

                  {/* Output Subtabs */}
                  <div className={`mt-2.5 flex items-center gap-1 rounded-lg p-0.5 ${segBg}`}>
                    {(
                      [
                        { id: 'naskah', label: 'Naskah & Riset' },
                        {
                          id: 'storyboard',
                          label: `Storyboard 9:16 (${activePackage.storyboard.scenes.length})`,
                        },
                        { id: 'guardian', label: 'Laporan Guardian' },
                        { id: 'seo', label: 'SEO YouTube' },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setPackageSubTab(st.id)}
                        className={`flex-1 rounded-md px-2 py-1 text-[11px] whitespace-nowrap transition-colors ${
                          packageSubTab === st.id ? segActive : segIdle
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  {/* Output Subtab Body */}
                  <div className="mt-2.5 max-h-[215px] space-y-2 overflow-y-auto pr-1 text-xs">
                    {packageSubTab === 'naskah' && (
                      <>
                        <div className={`rounded-md border p-2 ${subtleBorder}`}>
                          <p className={`text-[10px] font-semibold uppercase ${mutedText}`}>
                            Sudut Riset &amp; Pesan Utama
                          </p>
                          <p className="mt-0.5 leading-relaxed">{activePackage.research.angle}</p>
                          <p className={`mt-1 text-[11px] ${mutedText}`}>
                            Inti: {activePackage.research.keyTakeaway}
                          </p>
                        </div>
                        <div className={`rounded-md border p-2 ${subtleBorder}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-semibold uppercase ${mutedText}`}>
                              Hook &amp; Narasi ({activePackage.script.wordCount} kata ·{' '}
                              {activePackage.durationSeconds} detik)
                            </span>
                          </div>
                          <p className="mt-1 font-semibold">{activePackage.script.hook}</p>
                          <p className="mt-1.5 whitespace-pre-line leading-relaxed">
                            {activePackage.script.narration}
                          </p>
                          <p className={`mt-1.5 italic ${mutedText}`}>
                            Penutup: {activePackage.script.closing}
                          </p>
                        </div>
                      </>
                    )}

                    {packageSubTab === 'storyboard' && (
                      <>
                        {activePackage.storyboard.characterBible.length > 0 && (
                          <div className={`rounded-md border p-2 ${subtleBorder}`}>
                            <p className={`text-[10px] font-semibold uppercase ${mutedText}`}>
                              Character Bible (Konsistensi Visual)
                            </p>
                            <div className="mt-1 space-y-1">
                              {activePackage.storyboard.characterBible.map((c, idx) => (
                                <p key={idx} className="text-[11px]">
                                  <strong>{c.name}:</strong> {c.appearance} · {c.wardrobe}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="space-y-2">
                          {activePackage.storyboard.scenes.map((sc) => (
                            <div
                              key={sc.sceneNumber}
                              className={`rounded-md border p-2 ${subtleBorder}`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <span className="font-semibold">
                                  Adegan {sc.sceneNumber}: {sc.visualTitle}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onHandoffToMediaStudio({
                                        tab: 'video',
                                        prompt: sc.veoPrompt,
                                        aspect: '9:16',
                                      })
                                    }
                                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                      isDark
                                        ? 'bg-blue-600/80 text-white hover:bg-blue-500'
                                        : 'bg-slate-900 text-white hover:bg-slate-800'
                                    }`}
                                  >
                                    <Film className="h-2.5 w-2.5" aria-hidden="true" />
                                    Video AI 9:16
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onHandoffToMediaStudio({
                                        tab: 'image',
                                        prompt: sc.veoPrompt,
                                        aspect: '9:16',
                                      })
                                    }
                                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${subtleBorder}`}
                                  >
                                    <ImagePlus className="h-2.5 w-2.5" aria-hidden="true" />
                                    Gambar AI
                                  </button>
                                </div>
                              </div>
                              <p className="mt-1 text-[11px]">{sc.narrationSegment}</p>
                              <p className={`mt-1 font-mono text-[10px] ${mutedText}`}>
                                Prompt 9:16: {sc.veoPrompt}
                              </p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {packageSubTab === 'guardian' && (
                      <div className="space-y-2">
                        <div className={`rounded-md border p-2 ${subtleBorder}`}>
                          <p className="font-semibold">
                            Theological Guardian: {activePackage.theologicalGuardian.status}
                          </p>
                          <p className="mt-0.5 text-[11px]">
                            {activePackage.theologicalGuardian.summary}
                          </p>
                          {activePackage.theologicalGuardian.fatalErrors.length > 0 && (
                            <ul className="mt-1 list-disc pl-4 text-[11px] text-rose-500">
                              {activePackage.theologicalGuardian.fatalErrors.map((f, i) => (
                                <li key={i}>{f}</li>
                              ))}
                            </ul>
                          )}
                          {activePackage.theologicalGuardian.manualVerification.length > 0 && (
                            <ul className={`mt-1 list-disc pl-4 text-[11px] ${mutedText}`}>
                              {activePackage.theologicalGuardian.manualVerification.map((m, i) => (
                                <li key={i}>{m}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className={`rounded-md border p-2 ${subtleBorder}`}>
                          <p className="font-semibold">
                            Pastoral Sensitivity Checker:{' '}
                            {activePackage.pastoralSensitivity.status}
                          </p>
                          <p className="mt-0.5 text-[11px]">
                            {activePackage.pastoralSensitivity.summary}
                          </p>
                          {activePackage.pastoralSensitivity.findings.length > 0 && (
                            <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-500">
                              {activePackage.pastoralSensitivity.findings.map((f, i) => (
                                <li key={i}>{f}</li>
                              ))}
                            </ul>
                          )}
                          {activePackage.pastoralSensitivity.saferSuggestions.length > 0 && (
                            <ul className={`mt-1 list-disc pl-4 text-[11px] ${mutedText}`}>
                              {activePackage.pastoralSensitivity.saferSuggestions.map((s, i) => (
                                <li key={i}>Saran: {s}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}

                    {packageSubTab === 'seo' && (
                      <div className={`space-y-1.5 rounded-md border p-2 ${subtleBorder}`}>
                        <p className="font-semibold">{activePackage.seo.title}</p>
                        <p className="whitespace-pre-line text-[11px]">
                          {activePackage.seo.description}
                        </p>
                        <p className={`text-[11px] ${mutedText}`}>
                          Hashtag: {activePackage.seo.hashtags.join(' ')}
                        </p>
                        <p className={`text-[11px] ${mutedText}`}>
                          Tag: {activePackage.seo.tags.join(', ')}
                        </p>
                        <p className={`text-[10px] font-medium ${mutedText}`}>
                          Setelan Audiens: {activePackage.seo.madeForKids ? 'Made for Kids (Ramah Anak)' : 'Umum / Keluarga'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-12">
            {/* Left: 3-Channel Selector & Live Template Summary */}
            <div className="space-y-2 md:col-span-4">
              <div>
                <h3 className="text-xs font-bold">Pilih Channel untuk Diatur</h3>
                <p className={`mt-0.5 text-[11px] ${mutedText}`}>
                  Setiap channel punya template naskah, style visual 9:16, dan durasi default sendiri.
                </p>
              </div>
              <div className="space-y-1.5">
                {YOUTUBE_CHANNELS.map((ch) => {
                  const tpl = channelTemplates[ch.id];
                  const active = templateChannelId === ch.id;
                  const isCustom = tpl.updatedAt !== 'default';
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        setTemplateChannelId(ch.id);
                        setTemplateSavedNotice(null);
                      }}
                      aria-pressed={active}
                      className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                        active
                          ? isDark
                            ? 'border-blue-400 bg-slate-800 text-white'
                            : 'border-slate-900 bg-slate-900 text-white'
                          : cardBg
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-xs"
                            style={{ backgroundColor: ch.accentHex }}
                            aria-hidden="true"
                          />
                          <span className="truncate text-xs font-semibold">{ch.name}</span>
                        </div>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${
                            active
                              ? 'bg-white/20 text-white'
                              : isDark
                              ? 'bg-slate-800 text-slate-200'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {tpl.defaultDuration}d
                        </span>
                      </div>
                      <p
                        className={`mt-1 line-clamp-1 text-[10px] ${
                          active ? 'text-slate-300' : mutedText
                        }`}
                      >
                        {tpl.scriptTemplate}
                      </p>
                      <div className="mt-1 flex items-center justify-between text-[9.5px] opacity-80">
                        <span>{isCustom ? 'Disesuaikan' : 'Setelan Default'}</span>
                        <span>{computeScriptWordBudget(tpl.defaultDuration).minWords}–{computeScriptWordBudget(tpl.defaultDuration).maxWords} kata</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Template Editor Form */}
            <form
              onSubmit={handleSaveTemplate}
              className={`space-y-2.5 rounded-lg border p-3 md:col-span-8 ${cardBg}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold">
                    Konfigurasi Template · {getChannelById(templateChannelId).name}
                  </h3>
                  <p className={`text-[11px] ${mutedText}`}>
                    Otomatis dipakai oleh tim AI saat menjalankan Pipeline 3D untuk channel ini.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-[10px] tabular-nums ${mutedText}`}>
                    Target: {draftWordBudget.minWords}–{draftWordBudget.maxWords} kata
                  </span>
                  <div
                    role="group"
                    aria-label="Durasi default channel"
                    className={`flex items-center gap-0.5 rounded-lg p-0.5 ${segBg}`}
                  >
                    {([30, 45, 60] as ShortsDuration[]).map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => setDraftDefaultDuration(dur)}
                        aria-pressed={draftDefaultDuration === dur}
                        className={`rounded-md px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors ${
                          draftDefaultDuration === dur ? segActive : segIdle
                        }`}
                      >
                        {dur}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label htmlFor={tplScriptId} className="text-xs font-semibold">
                    Template Struktur Naskah
                  </label>
                  <textarea
                    id={tplScriptId}
                    rows={3}
                    value={draftScriptTemplate}
                    onChange={(e) => setDraftScriptTemplate(e.target.value)}
                    placeholder="Contoh: Hook pertanyaan -> Cerita singkat -> Pesan iman hangat..."
                    className={`mt-1 w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed focus:border-blue-500 focus:outline-none ${inputSurface}`}
                  />
                </div>
                <div>
                  <label htmlFor={tplVisualId} className="text-xs font-semibold">
                    Style Visual Storyboard 9:16
                  </label>
                  <textarea
                    id={tplVisualId}
                    rows={3}
                    value={draftVisualStyle}
                    onChange={(e) => setDraftVisualStyle(e.target.value)}
                    placeholder="Contoh: Stylized 3D Pixar warm lighting, vertical 9:16, no text or watermarks..."
                    className={`mt-1 w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed focus:border-blue-500 focus:outline-none ${inputSurface}`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor={tplCtaId} className="text-xs font-semibold">
                  Arahan Kalimat Penutup / CTA Default (Opsional)
                </label>
                <input
                  id={tplCtaId}
                  type="text"
                  value={draftClosingCta}
                  onChange={(e) => setDraftClosingCta(e.target.value)}
                  placeholder="Contoh: Simpan renungan ini untuk menguatkan hatimu hari ini."
                  className={`mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none ${inputSurface}`}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <div className="min-w-0 text-xs">
                  {templateError && (
                    <span role="alert" className="text-rose-500">
                      {templateError}
                    </span>
                  )}
                  {!templateError && templateSavedNotice && (
                    <span
                      role="status"
                      className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {templateSavedNotice}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetTemplate}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${subtleBorder}`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Reset Default
                  </button>
                  <button
                    type="submit"
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      isDark
                        ? 'bg-blue-600 text-white hover:bg-blue-500'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    Simpan &amp; Terapkan
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'guardian' && (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {/* Left: Standalone Theological Guardian & Pastoral Checker */}
            <div className={`rounded-lg border p-3 ${cardBg}`}>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-blue-500" aria-hidden="true" />
                <div>
                  <h3 className="text-xs font-bold">
                    Theological Guardian &amp; Pastoral Checker
                  </h3>
                  <p className={`text-[11px] ${mutedText}`}>
                    Audit naskah secara independen tanpa mengubah isi naskah Anda secara paksa.
                  </p>
                </div>
              </div>

              <form onSubmit={handleRunGuardian} className="mt-2.5 space-y-2">
                <input
                  type="text"
                  value={guardianRef}
                  onChange={(e) => setGuardianRef(e.target.value)}
                  placeholder="Referensi Alkitab opsional (mis. Mazmur 23:1-4)"
                  className={`w-full rounded-lg border px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none ${inputSurface}`}
                />
                <textarea
                  rows={4}
                  value={guardianScript}
                  onChange={(e) => setGuardianScript(e.target.value)}
                  placeholder="Tempelkan naskah YouTube Shorts yang ingin diaudit akurasi teologi dan kepekaan pastoralnya..."
                  className={`w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none ${inputSurface}`}
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (activePackage) {
                        setGuardianRef(activePackage.bibleReference);
                        setGuardianScript(
                          `${activePackage.script.hook}\n${activePackage.script.narration}\n${activePackage.script.closing}`
                        );
                      }
                    }}
                    disabled={!activePackage}
                    className={`text-[11px] underline-offset-2 hover:underline disabled:opacity-40 ${
                      isDark ? 'text-blue-400' : 'text-blue-700'
                    }`}
                  >
                    Ambil dari Naskah Terakhir
                  </button>
                  <button
                    type="submit"
                    disabled={guardianLoading}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                      isDark
                        ? 'bg-blue-600 text-white hover:bg-blue-500'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {guardianLoading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        Memeriksa...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Audit Naskah
                      </>
                    )}
                  </button>
                </div>
              </form>

              {guardianError && (
                <p role="alert" className="mt-2 text-xs text-rose-500">
                  {guardianError}
                </p>
              )}

              {guardianResult && (
                <div className={`mt-2.5 space-y-2 rounded-md border p-2.5 text-xs ${subtleBorder}`}>
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${verdictStyle(
                        guardianResult.theologicalGuardian.status,
                        isDark
                      )}`}
                    >
                      Teologi: {guardianResult.theologicalGuardian.status}
                    </span>
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${verdictStyle(
                        guardianResult.pastoralSensitivity.status,
                        isDark
                      )}`}
                    >
                      Pastoral: {guardianResult.pastoralSensitivity.status}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {guardianResult.theologicalGuardian.summary}
                  </p>
                  <p className={`text-[11px] leading-relaxed ${mutedText}`}>
                    Pastoral: {guardianResult.pastoralSensitivity.summary}
                  </p>
                  {guardianResult.pastoralSensitivity.saferSuggestions.length > 0 && (
                    <ul className="list-disc pl-4 text-[11px]">
                      {guardianResult.pastoralSensitivity.saferSuggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Right: Community / Prayer Manager */}
            <div className={`rounded-lg border p-3 ${cardBg}`}>
              <div className="flex items-center gap-2">
                <HeartHandshake className="h-4 w-4 text-amber-500" aria-hidden="true" />
                <div>
                  <h3 className="text-xs font-bold">Community &amp; Prayer Manager</h3>
                  <p className={`text-[11px] ${mutedText}`}>
                    Susun draf balasan hangat &le; 3 kalimat dengan tanda prioritas pastoral (tidak
                    dikirim otomatis).
                  </p>
                </div>
              </div>

              <form onSubmit={handleRunCommunityReply} className="mt-2.5 space-y-2">
                <select
                  aria-label="Channel asal komentar"
                  value={communityChannelId}
                  onChange={(e) => setCommunityChannelId(e.target.value as ShortsChannelId)}
                  className={`w-full rounded-lg border px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none ${inputSurface}`}
                >
                  {YOUTUBE_CHANNELS.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}
                    </option>
                  ))}
                </select>
                <textarea
                  rows={4}
                  value={viewerComment}
                  onChange={(e) => setViewerComment(e.target.value)}
                  placeholder="Tempelkan komentar atau permohonan doa dari pemirsa YouTube..."
                  className={`w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none ${inputSurface}`}
                />
                <div className="flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={communityLoading}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                      isDark
                        ? 'bg-amber-600 text-white hover:bg-amber-500'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {communityLoading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        Menyusun Draf...
                      </>
                    ) : (
                      <>
                        <HeartHandshake className="h-3.5 w-3.5" aria-hidden="true" />
                        Susun Draf Balasan
                      </>
                    )}
                  </button>
                </div>
              </form>

              {communityError && (
                <p role="alert" className="mt-2 text-xs text-rose-500">
                  {communityError}
                </p>
              )}

              {communityResult && (
                <div className={`mt-2.5 space-y-2 rounded-md border p-2.5 text-xs ${subtleBorder}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold">
                      {careFlagMeta(communityResult.careFlag).label}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyReply}
                      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${subtleBorder}`}
                    >
                      {copiedReply ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
                          Tersalin
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" aria-hidden="true" />
                          Salin Balasan
                        </>
                      )}
                    </button>
                  </div>
                  <p className="leading-relaxed">{communityResult.reply}</p>
                  <p className={`text-[10px] ${mutedText}`}>{communityResult.note}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'channels' && (
          <div className="space-y-3">
            {/* Live Jakarta WIB Schedule Banner */}
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                jakartaStatus.isSundayRest
                  ? isDark
                    ? 'border-amber-500/40 bg-amber-950/60 text-amber-200'
                    : 'border-amber-300 bg-amber-50 text-amber-900'
                  : isDark
                  ? 'border-emerald-500/35 bg-emerald-950/40 text-emerald-200'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="font-semibold">{jakartaStatus.label}</span>
                <span className="opacity-80">· {jakartaStatus.scheduleSummary}</span>
              </div>
              <span className="font-mono text-[11px] font-semibold tabular-nums">
                {jakartaStatus.wibTimeText}
              </span>
            </div>

            {/* 3-Channel Portfolio & Queue */}
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
              {YOUTUBE_CHANNELS.map((ch) => {
                const items = queue.filter((q) => q.channelId === ch.id);
                return (
                  <div key={ch.id} className={`rounded-lg border p-2.5 ${cardBg}`}>
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-xs"
                          style={{ backgroundColor: ch.accentHex }}
                          aria-hidden="true"
                        />
                        <h3 className="text-xs font-bold">{ch.name}</h3>
                      </div>
                      <span className={`font-mono text-[10px] tabular-nums ${mutedText}`}>
                        {items.length} antrean
                      </span>
                    </div>
                    <p className={`mt-1 text-[10px] ${mutedText}`}>{ch.focus}</p>
                    <div className="mt-2 space-y-1.5">
                      {items.map((item) => {
                        const readyAllowed = item.pkg ? canMarkReadyToPublish(item.pkg) : false;
                        return (
                          <div
                            key={item.id}
                            className={`rounded-md border p-2 text-[11px] ${subtleBorder}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="font-medium leading-snug">{item.title}</span>
                              <span
                                className={`shrink-0 rounded border px-1 py-0.5 text-[9px] font-semibold ${verdictStyle(
                                  item.guardianStatus,
                                  isDark
                                )}`}
                              >
                                {item.guardianStatus}
                              </span>
                            </div>
                            <div className="mt-1.5 flex items-center justify-between gap-1.5">
                              <select
                                aria-label={`Status antrean ${item.title}`}
                                value={item.stage}
                                onChange={(e) => {
                                  const nextStage = e.target.value as QueueStage;
                                  if (nextStage === 'Siap Publikasi' && !readyAllowed) return;
                                  onUpdateQueueStage(item.id, nextStage);
                                }}
                                className={`rounded border px-1.5 py-0.5 text-[10px] ${inputSurface}`}
                              >
                                <option value="Ide">Ide</option>
                                <option value="Dalam Produksi">Dalam Produksi</option>
                                <option value="Siap Publikasi" disabled={!readyAllowed}>
                                  Siap Publikasi {!readyAllowed ? '(Perlu Lulus Guardian)' : ''}
                                </option>
                                <option value="Sudah Terbit (manual)">Sudah Terbit (manual)</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleLoadQueueToProducer(item)}
                                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                  isDark
                                    ? 'bg-slate-800 text-blue-300 hover:bg-slate-700'
                                    : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                                }`}
                              >
                                Produksi
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Add Idea Bar */}
            <form
              onSubmit={handleAddQueueIdea}
              className={`flex flex-wrap items-center gap-2 rounded-lg border p-2.5 ${cardBg}`}
            >
              <select
                aria-label="Channel ide baru"
                value={newIdeaChannel}
                onChange={(e) => setNewIdeaChannel(e.target.value as ShortsChannelId)}
                className={`rounded-md border px-2 py-1 text-xs ${inputSurface}`}
              >
                {YOUTUBE_CHANNELS.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.shortLabel}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newIdeaTitle}
                onChange={(e) => setNewIdeaTitle(e.target.value)}
                placeholder="Tambah ide topik Shorts baru..."
                className={`min-w-[180px] flex-1 rounded-md border px-2.5 py-1 text-xs ${inputSurface}`}
              />
              <input
                type="text"
                value={newIdeaRef}
                onChange={(e) => setNewIdeaRef(e.target.value)}
                placeholder="Ayat (opsional)"
                className={`w-36 rounded-md border px-2 py-1 text-xs ${inputSurface}`}
              />
              <button
                type="submit"
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${
                  isDark
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Tambah Ide
              </button>
            </form>

            {/* Bottom Row: Bible Series 66-Book Planner + Local indo_tb.json Importer */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              {/* Bible Series 66-Book Protestant Canon Planner */}
              <div className={`rounded-lg border p-3 md:col-span-7 ${cardBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4 text-teal-500" aria-hidden="true" />
                    <h3 className="text-xs font-bold">
                      Perencana Seri Alkitab (Kanon {fullCanonSummary.totalBooks} Kitab ·{' '}
                      {fullCanonSummary.totalChapters.toLocaleString('id-ID')} Pasal)
                    </h3>
                  </div>
                  <span className={`font-mono text-[10px] ${mutedText}`}>
                    Terpilih: {selectedSeriesEstimate.totalBooks} kitab ·{' '}
                    {selectedSeriesEstimate.totalChapters} pasal (~
                    {selectedSeriesEstimate.estimatedEpisodes} ep)
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <select
                    aria-label="Kelompok kitab Alkitab"
                    value={selectedGroupId}
                    onChange={(e) => {
                      const nextGroup = e.target.value as BibleGroupId;
                      setSelectedGroupId(nextGroup);
                      const firstBook = PROTESTANT_BIBLE_BOOKS.find((b) => b.groupId === nextGroup);
                      if (firstBook) setSelectedBookIds([firstBook.id]);
                    }}
                    className={`rounded-md border px-2 py-1 text-xs ${inputSurface}`}
                  >
                    {PROTESTANT_BIBLE_GROUPS.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Channel tujuan seri Alkitab"
                    value={seriesChannelId}
                    onChange={(e) => setSeriesChannelId(e.target.value as ShortsChannelId)}
                    className={`rounded-md border px-2 py-1 text-xs ${inputSurface}`}
                  >
                    {YOUTUBE_CHANNELS.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.shortLabel}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Durasi episode seri Alkitab"
                    value={seriesDuration}
                    onChange={(e) => setSeriesDuration(Number(e.target.value) as ShortsDuration)}
                    className={`rounded-md border px-2 py-1 text-xs ${inputSurface}`}
                  >
                    <option value={30}>30 detik</option>
                    <option value={45}>45 detik</option>
                    <option value={60}>60 detik</option>
                  </select>
                  <button
                    type="button"
                    disabled={seriesLoading}
                    onClick={handlePlanBibleSeries}
                    className={`ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-60 ${
                      isDark
                        ? 'bg-teal-600 text-white hover:bg-teal-500'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {seriesLoading ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        Menyusun...
                      </>
                    ) : (
                      'Susun Episode AI'
                    )}
                  </button>
                </div>

                {/* Books in Selected Group */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {groupBooks.map((book) => {
                    const active = selectedBookIds.includes(book.id);
                    return (
                      <button
                        key={book.id}
                        type="button"
                        onClick={() => handleToggleBook(book.id)}
                        aria-pressed={active}
                        className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
                          active
                            ? isDark
                              ? 'border-teal-400 bg-teal-600 text-white font-semibold'
                              : 'border-slate-900 bg-slate-900 text-white font-semibold'
                            : subtleBorder
                        }`}
                      >
                        {book.name} ({book.chapterCount})
                      </button>
                    );
                  })}
                </div>

                {seriesError && (
                  <p role="alert" className="mt-1.5 text-xs text-rose-500">
                    {seriesError}
                  </p>
                )}

                {seriesEpisodes.length > 0 && (
                  <div className="mt-2 max-h-[120px] space-y-1.5 overflow-y-auto pr-1">
                    {seriesEpisodes.map((ep) => (
                      <div
                        key={`${ep.sequenceNo}-${ep.title}`}
                        className={`flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-[11px] ${subtleBorder}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            Ep {ep.sequenceNo}: {ep.title} ({ep.reference})
                          </p>
                          <p className={`truncate text-[10px] ${mutedText}`}>{ep.summary}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setChannelId(seriesChannelId);
                            setTitle(ep.title);
                            setBibleReference(ep.reference);
                            setDurationSeconds(seriesDuration);
                            setNotes(`${ep.summary} · Pesan: ${ep.teachingPoint}`);
                            setActiveQueueId(null);
                            setActiveTab('produksi');
                          }}
                          className={`shrink-0 rounded px-2 py-1 text-[10px] font-semibold ${
                            isDark
                              ? 'bg-blue-600 text-white hover:bg-blue-500'
                              : 'bg-slate-900 text-white hover:bg-slate-800'
                          }`}
                        >
                          Produksi Episode
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Shared Master Bible loaded once from Settings and Firestore for all floors */}
              <div className={`rounded-lg border p-3 md:col-span-5 ${cardBg}`}>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-sky-600 dark:text-sky-300" aria-hidden="true" />
                  <h3 className="text-xs font-bold">Master Alkitab Terjemahan Baru · Sumber Bersama</h3>
                </div>
                {masterBible ? (
                  <div className={`mt-2 space-y-1.5 rounded-md border p-2 text-[11px] ${subtleBorder}`}>
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{masterBible.report.sourceName}</span>
                    </div>
                    <p className="font-mono text-[10px] tabular-nums">
                      {masterBible.report.bookCount}/66 kitab · {masterBible.report.chapterCount} pasal · {masterBible.report.indexedVerseCount.toLocaleString('id-ID')} ayat
                    </p>
                    <p className={`text-[10px] ${mutedText}`}>
                      Sumber yang sama dipakai Lantai 1, 2, dan 3. Data tersimpan di Firestore milik akun ini dan dibaca untuk konteks setiap pekerjaan AI.
                    </p>
                  </div>
                ) : (
                  <div className={`mt-2 rounded-md border border-dashed p-2.5 text-[11px] ${subtleBorder} ${mutedText}`}>
                    Master Alkitab belum tersedia. Unggah satu kali melalui Pengaturan → Master Alkitab. Semua lantai akan memakai sumber yang sama.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
