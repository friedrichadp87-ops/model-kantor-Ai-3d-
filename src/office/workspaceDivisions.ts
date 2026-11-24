import type { AgentId, OfficeSimulationState, OfficeZoneId } from './types';
import {
  YOUTUBE_CHANNELS,
  type ShortsChannelId,
  type ShortsDuration,
  type ShortsQueueItem,
} from './shortsFactory';
import type { GeneratedMediaItem } from './mediaStudio';

export type WorkspaceDivisionId =
  | 'dashboard'
  | 'channel-youtube'
  | 'ai-agent'
  | 'guardian-komunitas'
  | 'bible-series'
  | 'church-shorts'
  | 'video-editor'
  | 'produksi-konten'
  | 'jadwal-publikasi'
  | 'analitik-laporan'
  | 'pengaturan';

export interface WorkspaceDivisionConfig {
  id: WorkspaceDivisionId;
  label: string;
  divisionName: string;
  description: string;
  cameraZone: OfficeZoneId;
  leadAgents: AgentId[];
}

export const WORKSPACE_DIVISIONS: WorkspaceDivisionConfig[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    divisionName: 'Pusat Komando 3D',
    description: 'Ikhtisar seluruh lantai kantor AI 3D dengan 13 karakter agen, utilisasi, dan log aktivitas.',
    cameraZone: 'overview',
    leadAgents: ['ceo', 'bible-researcher', 'theological-guardian'],
  },
  {
    id: 'channel-youtube',
    label: 'Channel YouTube',
    divisionName: 'Divisi Portofolio 3 Channel',
    description: 'Kelola antrean 3 channel YouTube Shorts dan gerbang publikasi Guardian.',
    cameraZone: 'riset',
    leadAgents: ['trend-researcher', 'bible-researcher'],
  },
  {
    id: 'ai-agent',
    label: 'AI Agent',
    divisionName: 'Divisi 13 Agen AI',
    description: 'Lihat nama, jabatan, dan tanggung jawab 13 karakter 3D agen AI serta tugaskan langsung.',
    cameraZone: 'overview',
    leadAgents: ['ceo', 'scriptwriter', 'storyboard-artist'],
  },
  {
    id: 'guardian-komunitas',
    label: 'Guardian & Komunitas',
    divisionName: 'Divisi Teologi & Pastoral',
    description: 'Audit Theological Guardian, Pastoral Checker, dan balasan doa pemirsa.',
    cameraZone: 'riset',
    leadAgents: ['theological-guardian', 'pastoral-checker', 'community-prayer'],
  },
  {
    id: 'bible-series',
    label: 'Bible Series',
    divisionName: 'Divisi Kanon 66 Kitab',
    description: 'Rencanakan seri Alkitab 66 kitab (1.189 pasal) dan verifikasi indo_tb.json lokal.',
    cameraZone: 'riset',
    leadAgents: ['bible-researcher', 'theological-guardian'],
  },
  {
    id: 'church-shorts',
    label: 'Church Shorts',
    divisionName: 'Divisi Klip Khotbah & Gereja',
    description: 'Ekstrak potongan Shorts vertikal 9:16 dari catatan khotbah atau warta gereja.',
    cameraZone: 'rapat',
    leadAgents: ['voice-artist', 'video-editor'],
  },
  {
    id: 'video-editor',
    label: 'Video Editor',
    divisionName: 'Divisi Visual & Video 9:16',
    description: 'Buat video 9:16/16:9, olah gambar AI, dan proyeksikan ke layar kantor 3D.',
    cameraZone: 'kode',
    leadAgents: ['video-editor', 'visual-curator', 'video-composer'],
  },
  {
    id: 'produksi-konten',
    label: 'Produksi Konten',
    divisionName: 'Divisi Naskah & Storyboard',
    description: 'Jalankan pipeline multi-agen 3D untuk naskah, storyboard 9:16, SEO, dan SRT.',
    cameraZone: 'kode',
    leadAgents: ['scriptwriter', 'storyboard-artist', 'theological-guardian'],
  },
  {
    id: 'jadwal-publikasi',
    label: 'Jadwal Publikasi',
    divisionName: 'Divisi Operasional WIB',
    description: 'Atur jadwal tayang mingguan 3 channel dengan jeda Istirahat Minggu 06:00–15:00 WIB.',
    cameraZone: 'server',
    leadAgents: ['seo-publisher', 'ceo'],
  },
  {
    id: 'analitik-laporan',
    label: 'Analitik & Laporan',
    divisionName: 'Divisi Data & Kualitas',
    description: 'Pantau metrik produksi per channel, kelulusan Guardian, dan ekspor laporan.',
    cameraZone: 'server',
    leadAgents: ['seo-publisher', 'theological-guardian'],
  },
  {
    id: 'pengaturan',
    label: 'Pengaturan',
    divisionName: 'Koneksi AI & Template',
    description: 'Sambungkan Ollama localhost, pantau koneksi Gemini API & ElevenLabs, serta atur template channel.',
    cameraZone: 'server',
    leadAgents: ['ceo', 'voice-artist', 'video-composer'],
  },
];

export function getDivisionById(id: WorkspaceDivisionId): WorkspaceDivisionConfig {
  return WORKSPACE_DIVISIONS.find((d) => d.id === id) ?? WORKSPACE_DIVISIONS[0];
}

export interface ChurchShortClipIdea {
  clipNumber: number;
  title: string;
  hook: string;
  highlightQuote: string;
  bibleReference: string;
  suggestedChannelId: ShortsChannelId;
  durationSeconds: ShortsDuration;
  visualDirection: string;
}

export function validateChurchSourceInput(input: {
  sermonTitle: string;
  transcript: string;
}): { ok: true } | { ok: false; error: string } {
  const sermonTitle = input.sermonTitle.trim();
  const transcript = input.transcript.trim();
  if (sermonTitle.length < 3 || sermonTitle.length > 140) {
    return { ok: false, error: 'Judul khotbah / ibadah harus 3–140 karakter.' };
  }
  if (transcript.length < 30 || transcript.length > 6000) {
    return {
      ok: false,
      error: 'Masukkan ringkasan atau transkrip khotbah minimal 30 karakter (maks. 6.000).',
    };
  }
  return { ok: true };
}

export type WeekdayKey = 'senin' | 'selasa' | 'rabu' | 'kamis' | 'jumat' | 'sabtu' | 'minggu';

export interface PublicationSlot {
  id: string;
  day: WeekdayKey;
  dayLabel: string;
  timeWib: string;
  channelId: ShortsChannelId;
  queueItemId: string | null;
  sundayRestProtected: boolean;
}

export function createDefaultWeeklySchedule(queue: ShortsQueueItem[]): PublicationSlot[] {
  const firstByChannel = (ch: ShortsChannelId) =>
    queue.find((q) => q.channelId === ch)?.id ?? null;

  return [
    {
      id: 'slot-senin',
      day: 'senin',
      dayLabel: 'Senin',
      timeWib: '07:00 WIB',
      channelId: 'daily-faith-inspiration',
      queueItemId: firstByChannel('daily-faith-inspiration'),
      sundayRestProtected: false,
    },
    {
      id: 'slot-selasa',
      day: 'selasa',
      dayLabel: 'Selasa',
      timeWib: '16:00 WIB',
      channelId: 'bible-stories-3d',
      queueItemId: firstByChannel('bible-stories-3d'),
      sundayRestProtected: false,
    },
    {
      id: 'slot-rabu',
      day: 'rabu',
      dayLabel: 'Rabu',
      timeWib: '19:00 WIB',
      channelId: 'bible-facts-mysteries',
      queueItemId: firstByChannel('bible-facts-mysteries'),
      sundayRestProtected: false,
    },
    {
      id: 'slot-kamis',
      day: 'kamis',
      dayLabel: 'Kamis',
      timeWib: '07:00 WIB',
      channelId: 'daily-faith-inspiration',
      queueItemId: null,
      sundayRestProtected: false,
    },
    {
      id: 'slot-jumat',
      day: 'jumat',
      dayLabel: 'Jumat',
      timeWib: '16:00 WIB',
      channelId: 'bible-stories-3d',
      queueItemId: null,
      sundayRestProtected: false,
    },
    {
      id: 'slot-sabtu',
      day: 'sabtu',
      dayLabel: 'Sabtu',
      timeWib: '18:30 WIB',
      channelId: 'bible-facts-mysteries',
      queueItemId: null,
      sundayRestProtected: false,
    },
    {
      id: 'slot-minggu',
      day: 'minggu',
      dayLabel: 'Minggu',
      timeWib: '17:00 WIB (setelah jeda 06:00–15:00)',
      channelId: 'daily-faith-inspiration',
      queueItemId: null,
      sundayRestProtected: true,
    },
  ];
}

export function isTimeInsideSundayRest(timeWib: string): boolean {
  const match = /^(\d{1,2}):(\d{2})/.exec(timeWib.trim());
  if (!match) return false;
  const hour = Number(match[1]);
  return hour >= 6 && hour < 15;
}

export interface ChannelAnalyticsRow {
  channelId: ShortsChannelId;
  channelName: string;
  accentHex: string;
  totalJobs: number;
  readyCount: number;
  publishedCount: number;
  guardianPassedCount: number;
  guardianBlockedCount: number;
}

export interface WorkspaceAnalyticsSummary {
  totalQueueItems: number;
  readyToPublishCount: number;
  publishedCount: number;
  guardianPassRatePercent: number;
  completedAgentTasks: number;
  generatedMediaCount: number;
  channels: ChannelAnalyticsRow[];
}

export function computeWorkspaceAnalytics(params: {
  queue: ShortsQueueItem[];
  simState: OfficeSimulationState;
  mediaItems: GeneratedMediaItem[];
}): WorkspaceAnalyticsSummary {
  const { queue, simState, mediaItems } = params;
  const checkedItems = queue.filter((q) => q.guardianStatus !== 'BELUM DICEK');
  const passedItems = checkedItems.filter((q) => q.guardianStatus === 'LULUS');
  const guardianPassRatePercent =
    checkedItems.length > 0 ? Math.round((passedItems.length / checkedItems.length) * 100) : 100;

  const channels: ChannelAnalyticsRow[] = YOUTUBE_CHANNELS.map((ch) => {
    const items = queue.filter((q) => q.channelId === ch.id);
    return {
      channelId: ch.id,
      channelName: ch.name,
      accentHex: ch.accentHex,
      totalJobs: items.length,
      readyCount: items.filter((q) => q.stage === 'Siap Publikasi').length,
      publishedCount: items.filter((q) => q.stage === 'Sudah Terbit (manual)').length,
      guardianPassedCount: items.filter((q) => q.guardianStatus === 'LULUS').length,
      guardianBlockedCount: items.filter(
        (q) => q.guardianStatus === 'PERLU REVISI' || q.guardianStatus === 'DITOLAK'
      ).length,
    };
  });

  return {
    totalQueueItems: queue.length,
    readyToPublishCount: queue.filter((q) => q.stage === 'Siap Publikasi').length,
    publishedCount: queue.filter((q) => q.stage === 'Sudah Terbit (manual)').length,
    guardianPassRatePercent,
    completedAgentTasks: simState.completedTaskCount,
    generatedMediaCount: mediaItems.length,
    channels,
  };
}
