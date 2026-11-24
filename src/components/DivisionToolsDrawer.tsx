import { useId, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  Clock,
  Download,
  Loader2,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react';
import type { LightingPreset, OfficeSimulationState } from '../office/types';
import type { GeneratedMediaItem } from '../office/mediaStudio';
import {
  YOUTUBE_CHANNELS,
  getChannelById,
  getJakartaOperationStatus,
  type ShortsChannelId,
  type ShortsDuration,
  type ShortsQueueItem,
} from '../office/shortsFactory';
import {
  computeWorkspaceAnalytics,
  validateChurchSourceInput,
  type ChurchShortClipIdea,
  type PublicationSlot,
} from '../office/workspaceDivisions';

export type DivisionToolMode = 'church-shorts' | 'jadwal-publikasi' | 'analitik-laporan';

interface DivisionToolsDrawerProps {
  mode: DivisionToolMode;
  lighting: LightingPreset;
  queue: ShortsQueueItem[];
  schedule: PublicationSlot[];
  simState: OfficeSimulationState;
  mediaItems: GeneratedMediaItem[];
  onClose: () => void;
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
}

function downloadFile(filename: string, content: string, mime: string) {
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

export function DivisionToolsDrawer({
  mode,
  lighting,
  queue,
  schedule,
  simState,
  mediaItems,
  onClose,
  onUpdateScheduleSlot,
  onSendClipToProduction,
}: DivisionToolsDrawerProps) {
  const isDark = lighting === 'malam';
  const jakartaStatus = useMemo(() => getJakartaOperationStatus(), []);
  const analytics = useMemo(
    () => computeWorkspaceAnalytics({ queue, simState, mediaItems }),
    [queue, simState, mediaItems]
  );

  // Church Shorts state
  const [sermonTitle, setSermonTitle] = useState('Pengharapan yang Teguh di Tengah Badai');
  const [sermonChannelId, setSermonChannelId] =
    useState<ShortsChannelId>('daily-faith-inspiration');
  const [sermonDuration, setSermonDuration] = useState<ShortsDuration>(45);
  const [transcript, setTranscript] = useState(
    'Dalam ibadah minggu ini kita merenungkan Mazmur 23:1-4. Sering kali kita merasa lelah saat jalan hidup gelap, tetapi Tuhan berjanji berjalan bersama kita melewati lembah kekelaman. Iman bukan berarti tidak pernah takut, melainkan tetap menggenggam tangan Gembala yang Baik saat badai datang.'
  );
  const [clipLoading, setClipLoading] = useState(false);
  const [clipError, setClipError] = useState<string | null>(null);
  const [clips, setClips] = useState<ChurchShortClipIdea[]>([]);

  const sermonTitleId = useId();
  const transcriptId = useId();

  const surfaceClass = isDark
    ? 'border-slate-700/90 bg-[#0f172a]/96 text-slate-100'
    : 'border-slate-200/95 bg-[#fcfbf8]/97 text-slate-900';
  const subtleBorder = isDark ? 'border-slate-800' : 'border-slate-200/90';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';
  const inputSurface = isDark
    ? 'border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500'
    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400';
  const cardBg = isDark ? 'border-slate-800 bg-slate-900/85' : 'border-slate-200 bg-white';

  const handleExtractClips = async (e: FormEvent) => {
    e.preventDefault();
    setClipError(null);
    const valid = validateChurchSourceInput({ sermonTitle, transcript });
    if (!valid.ok) {
      setClipError(valid.error);
      return;
    }

    setClipLoading(true);
    try {
      const res = await fetch('/api/shorts/church-clips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sermonTitle: sermonTitle.trim(),
          transcript: transcript.trim(),
          channelId: sermonChannelId,
          durationSeconds: sermonDuration,
        }),
      });
      const data = (await res.json()) as { clips?: ChurchShortClipIdea[]; error?: string };
      if (!res.ok || !Array.isArray(data.clips)) {
        setClipError(data.error ?? 'Gagal mengekstrak ide klip Church Shorts.');
        return;
      }
      setClips(data.clips);
    } catch {
      setClipError('Koneksi ke server Divisi Church Shorts terputus.');
    } finally {
      setClipLoading(false);
    }
  };

  const handleDownloadMarkdownReport = () => {
    const lines = [
      `# Laporan Analitik Kantor AI 3D (${jakartaStatus.wibTimeText})`,
      '',
      `- Total Antrean Shorts: ${analytics.totalQueueItems}`,
      `- Siap Publikasi (Lulus Guardian): ${analytics.readyToPublishCount}`,
      `- Sudah Terbit (Manual): ${analytics.publishedCount}`,
      `- Rasio Kelulusan Guardian: ${analytics.guardianPassRatePercent}%`,
      `- Tugas Agen 3D Selesai: ${analytics.completedAgentTasks}`,
      `- Aset Media AI Dibuat: ${analytics.generatedMediaCount}`,
      '',
      '## Rincian Per Channel YouTube',
      ...analytics.channels.map(
        (c) =>
          `- **${c.channelName}**: ${c.totalJobs} pekerjaan · ${c.readyCount} siap publikasi · ${c.guardianPassedCount} lulus Guardian · ${c.guardianBlockedCount} perlu revisi/ditolak`
      ),
    ];
    downloadFile('laporan-kantor-ai-3d.md', `${lines.join('\n')}\n`, 'text/markdown;charset=utf-8');
  };

  const headerMeta: Record<
    DivisionToolMode,
    { title: string; subtitle: string; Icon: typeof Scissors }
  > = {
    'church-shorts': {
      title: 'Divisi Church Shorts · Ekstraktor Klip Khotbah 9:16',
      subtitle: 'Ubah ringkasan atau transkrip ibadah gereja menjadi 3–4 ide klip vertikal siap produksi',
      Icon: Scissors,
    },
    'jadwal-publikasi': {
      title: 'Divisi Jadwal Publikasi · Kalender Mingguan WIB',
      subtitle: 'Atur jadwal tayang 3 channel dengan perlindungan otomatis Istirahat Minggu 06:00–15:00 WIB',
      Icon: CalendarDays,
    },
    'analitik-laporan': {
      title: 'Divisi Analitik & Laporan · Kinerja 3 Channel & Agen 3D',
      subtitle: 'Metrik real-time antrean produksi, kelulusan Guardian, dan ekspor ringkasan operasional',
      Icon: BarChart3,
    },
  };

  const HeaderIcon = headerMeta[mode].Icon;

  return (
    <section
      aria-label={headerMeta[mode].title}
      className={`pointer-events-auto mb-2 w-full rounded-xl border shadow-xl transition-colors duration-200 ${surfaceClass}`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between gap-2 border-b px-3.5 py-2.5 ${subtleBorder}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <HeaderIcon className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold tracking-tight">{headerMeta[mode].title}</h2>
            <p className={`truncate text-[11px] ${mutedText}`}>{headerMeta[mode].subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup panel divisi"
          className={`shrink-0 rounded-lg p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
            isDark
              ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
              : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Body */}
      <div className="max-h-[360px] overflow-y-auto p-3.5">
        {mode === 'church-shorts' && (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-12">
            <form onSubmit={handleExtractClips} className="space-y-2.5 md:col-span-5">
              <div>
                <label htmlFor={sermonTitleId} className="text-xs font-semibold">
                  Judul Khotbah / Ibadah
                </label>
                <input
                  id={sermonTitleId}
                  type="text"
                  value={sermonTitle}
                  onChange={(e) => setSermonTitle(e.target.value)}
                  className={`mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none ${inputSurface}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[11px] font-semibold">Channel Utama</span>
                  <select
                    aria-label="Channel tujuan Church Shorts"
                    value={sermonChannelId}
                    onChange={(e) => setSermonChannelId(e.target.value as ShortsChannelId)}
                    className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-xs ${inputSurface}`}
                  >
                    {YOUTUBE_CHANNELS.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.shortLabel}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="text-[11px] font-semibold">Target Durasi</span>
                  <select
                    aria-label="Durasi klip Church Shorts"
                    value={sermonDuration}
                    onChange={(e) => setSermonDuration(Number(e.target.value) as ShortsDuration)}
                    className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-xs ${inputSurface}`}
                  >
                    <option value={30}>30 detik</option>
                    <option value={45}>45 detik</option>
                    <option value={60}>60 detik</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor={transcriptId} className="text-xs font-semibold">
                  Ringkasan / Transkrip Khotbah
                </label>
                <textarea
                  id={transcriptId}
                  rows={4}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Tempelkan catatan khotbah, kutipan penting, atau transkrip ibadah..."
                  className={`mt-1 w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed focus:border-blue-500 focus:outline-none ${inputSurface}`}
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className={`text-[10px] ${mutedText}`}>
                  Hasil klip langsung bisa dikirim ke Pipeline 3D
                </span>
                <button
                  type="submit"
                  disabled={clipLoading}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                    isDark
                      ? 'bg-blue-600 text-white hover:bg-blue-500'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {clipLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Mengekstrak...
                    </>
                  ) : (
                    <>
                      <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
                      Ekstrak Klip Shorts
                    </>
                  )}
                </button>
              </div>

              {clipError && (
                <div
                  role="alert"
                  className="flex items-start gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-xs text-rose-500"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{clipError}</span>
                </div>
              )}
            </form>

            <div className="space-y-2 md:col-span-7">
              {clips.length === 0 ? (
                <div
                  className={`flex h-full min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed p-5 text-center ${subtleBorder}`}
                >
                  <Scissors className={`h-6 w-6 ${mutedText}`} aria-hidden="true" />
                  <h3 className="mt-2 text-xs font-semibold">
                    Siap Memotong Klip Khotbah Menjadi Shorts 9:16
                  </h3>
                  <p className={`mt-1 max-w-md text-xs leading-relaxed ${mutedText}`}>
                    Klik <strong>Ekstrak Klip Shorts</strong> untuk memisahkan poin paling menyentuh
                    dari khotbah menjadi 3–4 klip vertikal lengkap dengan hook, kutipan, dan arah
                    visual.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {clips.map((clip) => {
                    const ch = getChannelById(clip.suggestedChannelId);
                    return (
                      <div key={clip.clipNumber} className={`rounded-lg border p-2.5 ${cardBg}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-xs"
                              style={{ backgroundColor: ch.accentHex }}
                              aria-hidden="true"
                            />
                            <span className="text-xs font-bold">
                              Klip {clip.clipNumber}: {clip.title}
                            </span>
                            <span className={`font-mono text-[10px] ${mutedText}`}>
                              ({clip.durationSeconds}d)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onSendClipToProduction({
                                channelId: clip.suggestedChannelId,
                                title: clip.title,
                                bibleReference: clip.bibleReference,
                                durationSeconds: clip.durationSeconds,
                                notes: `Klip Khotbah: ${clip.hook} · Kutipan: "${clip.highlightQuote}" · Visual: ${clip.visualDirection}`,
                              })
                            }
                            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                              isDark
                                ? 'bg-blue-600 text-white hover:bg-blue-500'
                                : 'bg-slate-900 text-white hover:bg-slate-800'
                            }`}
                          >
                            <Sparkles className="h-3 w-3" aria-hidden="true" />
                            Produksi Klip
                          </button>
                        </div>
                        <p className="mt-1 text-[11px] font-medium">{clip.hook}</p>
                        <p className={`mt-1 text-[11px] italic ${mutedText}`}>
                          &ldquo;{clip.highlightQuote}&rdquo;
                          {clip.bibleReference ? ` — ${clip.bibleReference}` : ''}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {mode === 'jadwal-publikasi' && (
          <div className="space-y-3">
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

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {schedule.map((slot) => {
                const ch = getChannelById(slot.channelId);
                const channelQueue = queue.filter((q) => q.channelId === slot.channelId);
                return (
                  <div
                    key={slot.id}
                    className={`rounded-lg border p-2.5 ${
                      slot.sundayRestProtected
                        ? isDark
                          ? 'border-amber-500/40 bg-amber-950/20'
                          : 'border-amber-300 bg-amber-50/60'
                        : cardBg
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold">{slot.dayLabel}</span>
                      <span
                        className="h-2.5 w-2.5 rounded-xs"
                        style={{ backgroundColor: ch.accentHex }}
                        aria-hidden="true"
                      />
                    </div>
                    <p className={`mt-0.5 font-mono text-[10px] ${mutedText}`}>{slot.timeWib}</p>

                    <div className="mt-2 space-y-1.5">
                      <select
                        aria-label={`Channel jadwal ${slot.dayLabel}`}
                        value={slot.channelId}
                        onChange={(e) =>
                          onUpdateScheduleSlot(slot.id, {
                            channelId: e.target.value as ShortsChannelId,
                            queueItemId: null,
                          })
                        }
                        className={`w-full rounded border px-1.5 py-1 text-[11px] ${inputSurface}`}
                      >
                        {YOUTUBE_CHANNELS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.shortLabel}
                          </option>
                        ))}
                      </select>

                      <select
                        aria-label={`Konten jadwal ${slot.dayLabel}`}
                        value={slot.queueItemId ?? ''}
                        onChange={(e) =>
                          onUpdateScheduleSlot(slot.id, {
                            queueItemId: e.target.value || null,
                          })
                        }
                        className={`w-full rounded border px-1.5 py-1 text-[11px] ${inputSurface}`}
                      >
                        <option value="">-- Belum ditetapkan --</option>
                        {channelQueue.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} ({item.stage})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {mode === 'analitik-laporan' && (
          <div className="space-y-3">
            {/* Top KPI Cards */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {[
                { label: 'Total Antrean', value: String(analytics.totalQueueItems) },
                { label: 'Siap Publikasi', value: String(analytics.readyToPublishCount) },
                { label: 'Lulus Guardian', value: `${analytics.guardianPassRatePercent}%` },
                { label: 'Tugas Agen 3D', value: String(analytics.completedAgentTasks) },
                { label: 'Aset Media AI', value: String(analytics.generatedMediaCount) },
              ].map((kpi) => (
                <div key={kpi.label} className={`rounded-lg border px-3 py-2 ${cardBg}`}>
                  <p className={`text-[10.5px] ${mutedText}`}>{kpi.label}</p>
                  <p className="mt-0.5 font-mono text-lg font-bold tabular-nums">{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Per-Channel Breakdown */}
            <div className={`rounded-lg border p-3 ${cardBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold">Ringkasan Produksi Per Channel YouTube</h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleDownloadMarkdownReport}
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium ${subtleBorder}`}
                  >
                    <Download className="h-3 w-3" aria-hidden="true" />
                    Unduh Laporan (.md)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadFile(
                        'analitik-kantor-ai-3d.json',
                        JSON.stringify(
                          { generatedAt: new Date().toISOString(), wib: jakartaStatus.wibTimeText, ...analytics },
                          null,
                          2
                        ),
                        'application/json;charset=utf-8'
                      )
                    }
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium ${subtleBorder}`}
                  >
                    <Download className="h-3 w-3" aria-hidden="true" />
                    Ekspor JSON
                  </button>
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {analytics.channels.map((ch) => (
                  <div key={ch.channelId} className={`rounded-md border p-2.5 ${subtleBorder}`}>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-xs"
                        style={{ backgroundColor: ch.accentHex }}
                        aria-hidden="true"
                      />
                      <span className="text-xs font-semibold">{ch.channelName}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-[11px] tabular-nums">
                      <div>
                        <span className={`block text-[10px] font-sans ${mutedText}`}>Antrean</span>
                        <strong>{ch.totalJobs}</strong>
                      </div>
                      <div>
                        <span className={`block text-[10px] font-sans ${mutedText}`}>Siap Terbit</span>
                        <strong>{ch.readyCount}</strong>
                      </div>
                      <div>
                        <span className={`block text-[10px] font-sans ${mutedText}`}>Lulus Guardian</span>
                        <strong className="text-emerald-600 dark:text-emerald-400">
                          {ch.guardianPassedCount}
                        </strong>
                      </div>
                      <div>
                        <span className={`block text-[10px] font-sans ${mutedText}`}>Perlu Revisi</span>
                        <strong className="text-amber-600 dark:text-amber-400">
                          {ch.guardianBlockedCount}
                        </strong>
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
