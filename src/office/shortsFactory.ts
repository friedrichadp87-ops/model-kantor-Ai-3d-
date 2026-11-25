export type ShortsChannelId =
  | 'bible-stories-3d'
  | 'daily-faith-inspiration'
  | 'bible-facts-mysteries';

export type ShortsDuration = 30 | 45 | 60 | 170;

export type GuardianVerdict = 'LULUS' | 'PERLU REVISI' | 'DITOLAK';

export type CareFlag = 'normal' | 'needs_human_care' | 'urgent_safety';

export type QueueStage =
  | 'Ide'
  | 'Dalam Produksi'
  | 'Siap Publikasi'
  | 'Sudah Terbit (manual)';

export interface YouTubeShortsChannel {
  id: ShortsChannelId;
  name: string;
  shortLabel: string;
  focus: string;
  description: string;
  accentHex: string;
  madeForKids: boolean;
  defaultDuration: ShortsDuration;
  sampleTopics: Array<{
    title: string;
    bibleReference: string;
    notes: string;
  }>;
}

export const YOUTUBE_CHANNELS: YouTubeShortsChannel[] = [
  {
    id: 'bible-stories-3d',
    name: 'Bible Stories 3D',
    shortLabel: 'Stories 3D',
    focus: 'Cerita Alkitab 3D Kejadian–Wahyu (1 Pasal = 1 Cerita · 17×10d)',
    description:
      'Kisah Alkitab 3D dari Kejadian 1 hingga Wahyu 22 (1 pasal = 1 cerita utuh) berdurasi 2m 50d (17 adegan × 10 detik) dengan percakapan tokoh masuk ke narasi audio.',
    accentHex: '#2563eb',
    madeForKids: true,
    defaultDuration: 170,
    sampleTopics: [
      {
        title: 'Ep. 01 — Kejadian 1: Penciptaan Langit & Bumi (1 Pasal = 1 Cerita)',
        bibleReference: 'Kejadian 1:1-31',
        notes: '1 pasal penuh, 17 adegan × 10 detik (2m 50d), dialog masuk narasi audio, bersambung ke Kejadian 2.',
      },
      {
        title: '1 Samuel 17 — Daud dan Goliat: Iman Lebih Besar dari Raksasa',
        bibleReference: '1 Samuel 17:1-58',
        notes: 'Visual 3D hangat ramah keluarga, percakapan Daud & Goliat masuk narasi audio, 17×10d.',
      },
    ],
  },
  {
    id: 'daily-faith-inspiration',
    name: 'Daily Faith & Inspiration',
    shortLabel: 'Daily Faith',
    focus: 'Renungan harian 2m 50d berbasis Alkitab TB & sumber valid (LAI)',
    description:
      'Renungan harian ±2 menit 50 detik penuh berkat dari sumber renungan valid & Master Alkitab Terjemahan Baru, disertai animasi latar yang selaras dengan isi renungan.',
    accentHex: '#d97706',
    madeForKids: false,
    defaultDuration: 170,
    sampleTopics: [
      {
        title: 'Saat Doa Terasa Lama Dijawab',
        bibleReference: 'Mazmur 27:14',
        notes: 'Renungan harian 2m 50d penuh pengharapan berbasis Alkitab TB, animasi latar fajar tenang.',
      },
      {
        title: 'Damai Sejahtera di Tengah Kekhawatiran Hari Ini',
        bibleReference: 'Filipi 4:6-7',
        notes: 'Renungan harian 2m 50d berlandaskan Alkitab TB dengan latar alam teduh yang menenangkan hati.',
      },
    ],
  },
  {
    id: 'bible-facts-mysteries',
    name: 'Bible Facts & Mysteries',
    shortLabel: 'Facts & Mysteries',
    focus: 'Fakta arkeologi, kata Ibrani/Yunani & misteri Alkitab (≤2m 50d)',
    description:
      'Mengungkap bukti peninggalan arkeologi, makna asli kata Ibrani & Yunani yang sering disalahartikan, dan misteri Alkitab dengan visual animasi menyerupai objek riset (maks 2m 50d).',
    accentHex: '#0d9488',
    madeForKids: false,
    defaultDuration: 170,
    sampleTopics: [
      {
        title: 'Prasasti Tel Dan: Bukti Peninggalan Eksistensi Raja Daud',
        bibleReference: '2 Samuel 7:12-16',
        notes: 'Fakta arkeologi faktual, visual animasi menyerupai prasasti batu kuno, maks 2m 50d.',
      },
      {
        title: 'Kata Ibrani "Hesed" & Yunani "Tetelestai" yang Sering Disalahartikan',
        bibleReference: 'Mazmur 136:1 & Yohanes 19:30',
        notes: 'Kupas makna asli bahasa Alkitab dengan animasi gulungan manuskrip kuno.',
      },
    ],
  },
];

export type BibleGroupId =
  | 'ot_torah'
  | 'ot_history'
  | 'ot_wisdom'
  | 'ot_major_prophets'
  | 'ot_minor_prophets'
  | 'nt_gospels'
  | 'nt_acts'
  | 'nt_pauline_letters'
  | 'nt_general_letters'
  | 'nt_revelation';

export interface BibleGroup {
  id: BibleGroupId;
  label: string;
  testament: 'old' | 'new';
}

export interface BibleBook {
  order: number;
  id: string;
  name: string;
  groupId: BibleGroupId;
  testament: 'old' | 'new';
  chapterCount: number;
  aliases?: string[];
}

export const PROTESTANT_BIBLE_GROUPS: BibleGroup[] = [
  { id: 'ot_torah', label: 'Taurat (5 Kitab)', testament: 'old' },
  { id: 'ot_history', label: 'Kitab Sejarah PL (12 Kitab)', testament: 'old' },
  { id: 'ot_wisdom', label: 'Puisi & Hikmat (5 Kitab)', testament: 'old' },
  { id: 'ot_major_prophets', label: 'Nabi Besar (5 Kitab)', testament: 'old' },
  { id: 'ot_minor_prophets', label: 'Nabi Kecil (12 Kitab)', testament: 'old' },
  { id: 'nt_gospels', label: 'Injil (4 Kitab)', testament: 'new' },
  { id: 'nt_acts', label: 'Sejarah Gereja Mula-mula (1 Kitab)', testament: 'new' },
  { id: 'nt_pauline_letters', label: 'Surat-surat Paulus (13 Kitab)', testament: 'new' },
  { id: 'nt_general_letters', label: 'Surat-surat Am (8 Kitab)', testament: 'new' },
  { id: 'nt_revelation', label: 'Wahyu (1 Kitab)', testament: 'new' },
];

export const PROTESTANT_BIBLE_BOOKS: BibleBook[] = [
  // Old Testament (39 books, 929 chapters)
  { order: 1, id: 'kejadian', name: 'Kejadian', groupId: 'ot_torah', testament: 'old', chapterCount: 50, aliases: ['kej'] },
  { order: 2, id: 'keluaran', name: 'Keluaran', groupId: 'ot_torah', testament: 'old', chapterCount: 40, aliases: ['kel'] },
  { order: 3, id: 'imamat', name: 'Imamat', groupId: 'ot_torah', testament: 'old', chapterCount: 27, aliases: ['ima'] },
  { order: 4, id: 'bilangan', name: 'Bilangan', groupId: 'ot_torah', testament: 'old', chapterCount: 36, aliases: ['bil'] },
  { order: 5, id: 'ulangan', name: 'Ulangan', groupId: 'ot_torah', testament: 'old', chapterCount: 34, aliases: ['ula'] },

  { order: 6, id: 'yosua', name: 'Yosua', groupId: 'ot_history', testament: 'old', chapterCount: 24, aliases: ['yos'] },
  { order: 7, id: 'hakim-hakim', name: 'Hakim-hakim', groupId: 'ot_history', testament: 'old', chapterCount: 21, aliases: ['hakim', 'hak'] },
  { order: 8, id: 'rut', name: 'Rut', groupId: 'ot_history', testament: 'old', chapterCount: 4 },
  { order: 9, id: '1-samuel', name: '1 Samuel', groupId: 'ot_history', testament: 'old', chapterCount: 31, aliases: ['1 sam', '1sam'] },
  { order: 10, id: '2-samuel', name: '2 Samuel', groupId: 'ot_history', testament: 'old', chapterCount: 24, aliases: ['2 sam', '2sam'] },
  { order: 11, id: '1-raja-raja', name: '1 Raja-raja', groupId: 'ot_history', testament: 'old', chapterCount: 22, aliases: ['1 raj', '1raja-raja'] },
  { order: 12, id: '2-raja-raja', name: '2 Raja-raja', groupId: 'ot_history', testament: 'old', chapterCount: 25, aliases: ['2 raj', '2raja-raja'] },
  { order: 13, id: '1-tawarikh', name: '1 Tawarikh', groupId: 'ot_history', testament: 'old', chapterCount: 29, aliases: ['1 taw', '1taw'] },
  { order: 14, id: '2-tawarikh', name: '2 Tawarikh', groupId: 'ot_history', testament: 'old', chapterCount: 36, aliases: ['2 taw', '2taw'] },
  { order: 15, id: 'ezra', name: 'Ezra', groupId: 'ot_history', testament: 'old', chapterCount: 10, aliases: ['ezr'] },
  { order: 16, id: 'nehemia', name: 'Nehemia', groupId: 'ot_history', testament: 'old', chapterCount: 13, aliases: ['neh'] },
  { order: 17, id: 'ester', name: 'Ester', groupId: 'ot_history', testament: 'old', chapterCount: 10, aliases: ['est'] },

  { order: 18, id: 'ayub', name: 'Ayub', groupId: 'ot_wisdom', testament: 'old', chapterCount: 42, aliases: ['ayu'] },
  { order: 19, id: 'mazmur', name: 'Mazmur', groupId: 'ot_wisdom', testament: 'old', chapterCount: 150, aliases: ['mzm', 'maz'] },
  { order: 20, id: 'amsal', name: 'Amsal', groupId: 'ot_wisdom', testament: 'old', chapterCount: 31, aliases: ['ams'] },
  { order: 21, id: 'pengkhotbah', name: 'Pengkhotbah', groupId: 'ot_wisdom', testament: 'old', chapterCount: 12, aliases: ['pkh'] },
  { order: 22, id: 'kidung-agung', name: 'Kidung Agung', groupId: 'ot_wisdom', testament: 'old', chapterCount: 8, aliases: ['kid'] },

  { order: 23, id: 'yesaya', name: 'Yesaya', groupId: 'ot_major_prophets', testament: 'old', chapterCount: 66, aliases: ['yes'] },
  { order: 24, id: 'yeremia', name: 'Yeremia', groupId: 'ot_major_prophets', testament: 'old', chapterCount: 52, aliases: ['yer'] },
  { order: 25, id: 'ratapan', name: 'Ratapan', groupId: 'ot_major_prophets', testament: 'old', chapterCount: 5, aliases: ['rat'] },
  { order: 26, id: 'yehezkiel', name: 'Yehezkiel', groupId: 'ot_major_prophets', testament: 'old', chapterCount: 48, aliases: ['yeh'] },
  { order: 27, id: 'daniel', name: 'Daniel', groupId: 'ot_major_prophets', testament: 'old', chapterCount: 12, aliases: ['dan'] },

  { order: 28, id: 'hosea', name: 'Hosea', groupId: 'ot_minor_prophets', testament: 'old', chapterCount: 14, aliases: ['hos'] },
  { order: 29, id: 'yoel', name: 'Yoel', groupId: 'ot_minor_prophets', testament: 'old', chapterCount: 3, aliases: ['yoe'] },
  { order: 30, id: 'amos', name: 'Amos', groupId: 'ot_minor_prophets', testament: 'old', chapterCount: 9, aliases: ['amo'] },
  { order: 31, id: 'obaja', name: 'Obaja', groupId: 'ot_minor_prophets', testament: 'old', chapterCount: 1, aliases: ['oba'] },
  { order: 32, id: 'yunus', name: 'Yunus', groupId: 'ot_minor_prophets', testament: 'old', chapterCount: 4, aliases: ['yun'] },
  { order: 33, id: 'mikha', name: 'Mikha', groupId: 'ot_minor_prophets', testament: 'old', chapterCount: 7, aliases: ['mik'] },
  { order: 34, id: 'nahum', name: 'Nahum', groupId: 'ot_minor_prophets', testament: 'old', chapterCount: 3, aliases: ['nah'] },
  { order: 35, id: 'habakuk', name: 'Habakuk', groupId: 'ot_minor_prophets', testament: 'old', chapterCount: 3, aliases: ['hab'] },
  { order: 36, id: 'zefanya', name: 'Zefanya', groupId: 'ot_minor_prophets', testament: 'old', chapterCount: 3, aliases: ['zef'] },
  { order: 37, id: 'hagai', name: 'Hagai', groupId: 'ot_minor_prophets', testament: 'old', chapterCount: 2, aliases: ['hag'] },
  { order: 38, id: 'zakharia', name: 'Zakharia', groupId: 'ot_minor_prophets', testament: 'old', chapterCount: 14, aliases: ['zak'] },
  { order: 39, id: 'maleakhi', name: 'Maleakhi', groupId: 'ot_minor_prophets', testament: 'old', chapterCount: 4, aliases: ['mal'] },

  // New Testament (27 books, 260 chapters)
  { order: 40, id: 'matius', name: 'Matius', groupId: 'nt_gospels', testament: 'new', chapterCount: 28, aliases: ['mat'] },
  { order: 41, id: 'markus', name: 'Markus', groupId: 'nt_gospels', testament: 'new', chapterCount: 16, aliases: ['mrk'] },
  { order: 42, id: 'lukas', name: 'Lukas', groupId: 'nt_gospels', testament: 'new', chapterCount: 24, aliases: ['luk'] },
  { order: 43, id: 'yohanes', name: 'Yohanes', groupId: 'nt_gospels', testament: 'new', chapterCount: 21, aliases: ['yoh'] },

  { order: 44, id: 'kisah-para-rasul', name: 'Kisah Para Rasul', groupId: 'nt_acts', testament: 'new', chapterCount: 28, aliases: ['kis', 'kisah rasul'] },

  { order: 45, id: 'roma', name: 'Roma', groupId: 'nt_pauline_letters', testament: 'new', chapterCount: 16, aliases: ['rom'] },
  { order: 46, id: '1-korintus', name: '1 Korintus', groupId: 'nt_pauline_letters', testament: 'new', chapterCount: 16, aliases: ['1 kor', '1kor'] },
  { order: 47, id: '2-korintus', name: '2 Korintus', groupId: 'nt_pauline_letters', testament: 'new', chapterCount: 13, aliases: ['2 kor', '2kor'] },
  { order: 48, id: 'galatia', name: 'Galatia', groupId: 'nt_pauline_letters', testament: 'new', chapterCount: 6, aliases: ['gal'] },
  { order: 49, id: 'efesus', name: 'Efesus', groupId: 'nt_pauline_letters', testament: 'new', chapterCount: 6, aliases: ['efe'] },
  { order: 50, id: 'filipi', name: 'Filipi', groupId: 'nt_pauline_letters', testament: 'new', chapterCount: 4, aliases: ['flp', 'fil'] },
  { order: 51, id: 'kolose', name: 'Kolose', groupId: 'nt_pauline_letters', testament: 'new', chapterCount: 4, aliases: ['kol'] },
  { order: 52, id: '1-tesalonika', name: '1 Tesalonika', groupId: 'nt_pauline_letters', testament: 'new', chapterCount: 5, aliases: ['1 tes', '1tes'] },
  { order: 53, id: '2-tesalonika', name: '2 Tesalonika', groupId: 'nt_pauline_letters', testament: 'new', chapterCount: 3, aliases: ['2 tes', '2tes'] },
  { order: 54, id: '1-timotius', name: '1 Timotius', groupId: 'nt_pauline_letters', testament: 'new', chapterCount: 6, aliases: ['1 tim', '1tim'] },
  { order: 55, id: '2-timotius', name: '2 Timotius', groupId: 'nt_pauline_letters', testament: 'new', chapterCount: 4, aliases: ['2 tim', '2tim'] },
  { order: 56, id: 'titus', name: 'Titus', groupId: 'nt_pauline_letters', testament: 'new', chapterCount: 3, aliases: ['tit'] },
  { order: 57, id: 'filemon', name: 'Filemon', groupId: 'nt_pauline_letters', testament: 'new', chapterCount: 1, aliases: ['flm'] },

  { order: 58, id: 'ibrani', name: 'Ibrani', groupId: 'nt_general_letters', testament: 'new', chapterCount: 13, aliases: ['ibr'] },
  { order: 59, id: 'yakobus', name: 'Yakobus', groupId: 'nt_general_letters', testament: 'new', chapterCount: 5, aliases: ['yak'] },
  { order: 60, id: '1-petrus', name: '1 Petrus', groupId: 'nt_general_letters', testament: 'new', chapterCount: 5, aliases: ['1 ptr', '1 pet', '1pet'] },
  { order: 61, id: '2-petrus', name: '2 Petrus', groupId: 'nt_general_letters', testament: 'new', chapterCount: 3, aliases: ['2 ptr', '2 pet', '2pet'] },
  { order: 62, id: '1-yohanes', name: '1 Yohanes', groupId: 'nt_general_letters', testament: 'new', chapterCount: 5, aliases: ['1 yoh', '1yoh'] },
  { order: 63, id: '2-yohanes', name: '2 Yohanes', groupId: 'nt_general_letters', testament: 'new', chapterCount: 1, aliases: ['2 yoh', '2yoh'] },
  { order: 64, id: '3-yohanes', name: '3 Yohanes', groupId: 'nt_general_letters', testament: 'new', chapterCount: 1, aliases: ['3 yoh', '3yoh'] },
  { order: 65, id: 'yudas', name: 'Yudas', groupId: 'nt_general_letters', testament: 'new', chapterCount: 1, aliases: ['yud'] },

  { order: 66, id: 'wahyu', name: 'Wahyu', groupId: 'nt_revelation', testament: 'new', chapterCount: 22, aliases: ['why'] },
];

export interface StoryboardScene {
  sceneNumber: number;
  visualTitle: string;
  narrationSegment: string;
  veoPrompt: string;
  cameraMovement: string;
  mood: string;
  characters: string[];
}

export interface CharacterBibleEntry {
  name: string;
  appearance: string;
  wardrobe: string;
}

export interface GuardianReport {
  status: GuardianVerdict;
  summary: string;
  referencesChecked: string[];
  fatalErrors: string[];
  warnings: string[];
  manualVerification: string[];
  suggestedReplacements: string[];
}

export interface PastoralReport {
  status: GuardianVerdict;
  summary: string;
  findings: string[];
  saferSuggestions: string[];
}

export interface ShortsPackage {
  id: string;
  channelId: ShortsChannelId;
  title: string;
  bibleReference: string;
  durationSeconds: ShortsDuration;
  research: {
    angle: string;
    keyTakeaway: string;
    audienceFit: string;
  };
  script: {
    hook: string;
    narration: string;
    closing: string;
    wordCount: number;
  };
  storyboard: {
    characterBible: CharacterBibleEntry[];
    scenes: StoryboardScene[];
  };
  theologicalGuardian: GuardianReport;
  pastoralSensitivity: PastoralReport;
  seo: {
    title: string;
    description: string;
    tags: string[];
    hashtags: string[];
    madeForKids: boolean;
  };
  guardianGatePassed: boolean;
  generatedAt: string;
}

export interface ShortsQueueItem {
  id: string;
  channelId: ShortsChannelId;
  title: string;
  bibleReference: string;
  durationSeconds: ShortsDuration;
  notes: string;
  stage: QueueStage;
  guardianStatus: GuardianVerdict | 'BELUM DICEK';
  pkg?: ShortsPackage;
  updatedAt: string;
}

export interface BibleSeriesEpisode {
  sequenceNo: number;
  bookName: string;
  title: string;
  reference: string;
  summary: string;
  centralTheme: string;
  teachingPoint: string;
  hook: string;
}

export interface LocalBibleAuditReport {
  indexedVerseCount: number;
  bookCount: number;
  chapterCount: number;
  missingBookCount: number;
  sourceName: string;
  publisher: string;
  year: string;
  copyrightStatement: string;
}

export interface LocalBibleDatabase {
  versesMap: Record<string, string>; // key: `${normalizedBookId}:${chapter}:${verse}`
  report: LocalBibleAuditReport;
}

export interface JakartaOperationStatus {
  isSundayRest: boolean;
  label: string;
  scheduleSummary: string;
  wibTimeText: string;
  weekday: string;
  hour: number;
}

export interface LocalVerseLookupResult {
  reference: string;
  found: boolean;
  verses: Array<{ ref: string; text: string }>;
  missingRefs: string[];
}

export interface ChannelTemplateConfig {
  channelId: ShortsChannelId;
  scriptTemplate: string;
  visualStyle: string;
  defaultDuration: ShortsDuration;
  closingCta: string;
  updatedAt: string;
}

export type ChannelTemplatesMap = Record<ShortsChannelId, ChannelTemplateConfig>;

export const CHANNEL_TEMPLATES_STORAGE_KEY = 'kantor-ai-shorts-templates-v1';

export const DEFAULT_CHANNEL_TEMPLATES: ChannelTemplatesMap = {
  'bible-stories-3d': {
    channelId: 'bible-stories-3d',
    scriptTemplate:
      '1 Pasal = 1 Cerita utuh (Kejadian–Wahyu) -> Alur kronologis pasal lengkap dengan seluruh percakapan tokoh masuk ke narasi audio -> 17 adegan × 10 detik (2m 50d) -> Jembatan halus bersambung ke pasal berikutnya.',
    visualStyle:
      'Stylized 3D animated cinema (warm Pixar-inspired lighting), expressive friendly biblical characters consistent across all 17 ten-second scenes, vibrant natural landscapes, vertical 9:16, no text or watermarks.',
    defaultDuration: 170,
    closingCta: 'Ikuti lanjutan kisah pasal berikutnya dari seri Alkitab 3D bersama keluarga!',
    updatedAt: 'default',
  },
  'daily-faith-inspiration': {
    channelId: 'daily-faith-inspiration',
    scriptTemplate:
      'Sapaan hangat & ayat Alkitab Terjemahan Baru (0:00-0:30) -> Renungan mendalam dari sumber valid LAI yang menguatkan hati (0:30-1:50) -> Aplikasi iman praktis hari ini (1:50-2:25) -> Doa berkat penutup yang menenangkan (2:25-2:50).',
    visualStyle:
      'Peaceful atmospheric background animation matching the devotional message (golden sunrise over misty hills, gentle flowing river, warm sunlight through olive trees, tranquil evening sky), smooth contemplative motion, no embedded text or watermarks.',
    defaultDuration: 170,
    closingCta: 'Kiranya firman Tuhan hari ini menguatkan dan memberkati langkah hidupmu. Amin.',
    updatedAt: 'default',
  },
  'bible-facts-mysteries': {
    channelId: 'bible-facts-mysteries',
    scriptTemplate:
      'Hook misteri / fakta Alkitab jarang diketahui -> Bukti peninggalan arkeologi &/atau kupas makna asli kata Ibrani/Yunani yang sering salah diartikan -> 17 adegan × 10 detik (maks 2m 50d) berbasis Master Alkitab TB -> Kesimpulan faktual tanpa spekulasi liar.',
    visualStyle:
      'Documentary-grade historical reconstruction closely resembling real archaeological artifacts, ancient stone inscriptions, Hebrew & Greek parchment scrolls, Middle East ruins, warm cinematic lighting, vertical 9:16, no text or watermarks.',
    defaultDuration: 170,
    closingCta: 'Fakta arkeologi atau kata asli Alkitab apa lagi yang ingin kita telusuri berikutnya?',
    updatedAt: 'default',
  },
};

export function createDefaultChannelTemplates(): ChannelTemplatesMap {
  return {
    'bible-stories-3d': { ...DEFAULT_CHANNEL_TEMPLATES['bible-stories-3d'] },
    'daily-faith-inspiration': { ...DEFAULT_CHANNEL_TEMPLATES['daily-faith-inspiration'] },
    'bible-facts-mysteries': { ...DEFAULT_CHANNEL_TEMPLATES['bible-facts-mysteries'] },
  };
}

export function validateChannelTemplate(
  input: Partial<ChannelTemplateConfig>
): { ok: true; value: ChannelTemplateConfig } | { ok: false; error: string } {
  const channelId = input.channelId;
  if (!channelId || !YOUTUBE_CHANNELS.some((c) => c.id === channelId)) {
    return { ok: false, error: 'Channel template tidak valid.' };
  }
  const scriptTemplate = String(input.scriptTemplate ?? '').trim();
  if (scriptTemplate.length < 10 || scriptTemplate.length > 600) {
    return { ok: false, error: 'Template naskah harus 10–600 karakter.' };
  }
  const visualStyle = String(input.visualStyle ?? '').trim();
  if (visualStyle.length < 10 || visualStyle.length > 600) {
    return { ok: false, error: 'Style visual harus 10–600 karakter.' };
  }
  const dur = Number(input.defaultDuration);
  if (dur !== 30 && dur !== 45 && dur !== 60 && dur !== 170) {
    return { ok: false, error: 'Durasi default harus 30, 45, 60, atau 170 detik (2m 50d).' };
  }
  const closingCta = String(input.closingCta ?? '').trim().slice(0, 200);

  return {
    ok: true,
    value: {
      channelId,
      scriptTemplate,
      visualStyle,
      defaultDuration: dur as ShortsDuration,
      closingCta,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    },
  };
}

export function mergeChannelTemplates(saved: unknown): ChannelTemplatesMap {
  const base = createDefaultChannelTemplates();
  if (!saved || typeof saved !== 'object') return base;
  const obj = saved as Record<string, unknown>;
  for (const ch of YOUTUBE_CHANNELS) {
    const candidate = obj[ch.id];
    if (candidate && typeof candidate === 'object') {
      const checked = validateChannelTemplate({
        ...(candidate as Partial<ChannelTemplateConfig>),
        channelId: ch.id,
      });
      if (checked.ok) {
        base[ch.id] = checked.value;
      }
    }
  }
  return base;
}

export function formatTemplatePromptDirectives(
  template: Pick<ChannelTemplateConfig, 'scriptTemplate' | 'visualStyle' | 'closingCta'>
): string {
  const parts = [
    `Struktur Template Naskah Channel: ${template.scriptTemplate.trim()}`,
    `Style Visual Storyboard 9:16 Khusus Channel: ${template.visualStyle.trim()}`,
  ];
  if (template.closingCta.trim()) {
    parts.push(`Arahan Penutup / CTA Channel: ${template.closingCta.trim()}`);
  }
  return parts.join('\n');
}

export function getChannelById(channelId: ShortsChannelId): YouTubeShortsChannel {
  return YOUTUBE_CHANNELS.find((c) => c.id === channelId) ?? YOUTUBE_CHANNELS[0];
}

export function computeScriptWordBudget(durationSeconds: ShortsDuration): {
  minWords: number;
  maxWords: number;
} {
  if (durationSeconds === 170) {
    // 2 minutes 50 seconds calm devotional narration (~120-148 words/min)
    return { minWords: 340, maxWords: 420 };
  }
  const minWords = Math.max(35, Math.floor(durationSeconds * 1.45));
  const maxWords = Math.floor(durationSeconds * 2.0) + 4;
  return { minWords, maxWords };
}

export function estimateBookEpisodes(chapterCount: number): number {
  return Math.max(1, Math.min(12, Math.ceil(chapterCount / 4)));
}

export function estimateSeriesEpisodes(books: BibleBook[]): {
  totalBooks: number;
  totalChapters: number;
  estimatedEpisodes: number;
} {
  const totalBooks = books.length;
  const totalChapters = books.reduce((sum, b) => sum + b.chapterCount, 0);
  const estimatedEpisodes = books.reduce(
    (sum, b) => sum + estimateBookEpisodes(b.chapterCount),
    0
  );
  return { totalBooks, totalChapters, estimatedEpisodes };
}

export function getJakartaOperationStatus(date: Date = new Date()): JakartaOperationStatus {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const weekdayEn = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hourRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';

  const weekdayMap: Record<string, string> = {
    Sun: 'Minggu',
    Mon: 'Senin',
    Tue: 'Selasa',
    Wed: 'Rabu',
    Thu: 'Kamis',
    Fri: 'Jumat',
    Sat: 'Sabtu',
  };
  const weekday = weekdayMap[weekdayEn] ?? weekdayEn;
  const isSundayRest = weekdayEn === 'Sun' && hour >= 6 && hour < 15;
  const hh = String(hour).padStart(2, '0');
  const wibTimeText = `${weekday}, ${hh}:${minute} WIB`;

  return {
    isSundayRest,
    label: isSundayRest
      ? 'Istirahat Minggu (06:00–15:00 WIB)'
      : 'Operasional Aktif (Senin–Sabtu 24 Jam)',
    scheduleSummary: 'Senin–Sabtu 24 jam · Istirahat Minggu 06:00–15:00 WIB',
    wibTimeText,
    weekday,
    hour,
  };
}

function normalizeBookKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim();
}

const BOOK_LOOKUP_INDEX: Map<string, BibleBook> = (() => {
  const map = new Map<string, BibleBook>();
  for (const book of PROTESTANT_BIBLE_BOOKS) {
    map.set(normalizeBookKey(book.name), book);
    map.set(normalizeBookKey(book.id.replace(/-/g, ' ')), book);
    map.set(book.id, book);
    if (book.aliases) {
      for (const alias of book.aliases) {
        map.set(normalizeBookKey(alias), book);
      }
    }
  }
  return map;
})();

export function resolveIndonesianBook(nameOrAlias: string): BibleBook | null {
  const key = normalizeBookKey(nameOrAlias);
  if (!key) return null;
  const direct = BOOK_LOOKUP_INDEX.get(key);
  if (direct) return direct;
  const compact = key.replace(/\s+/g, '');
  for (const [candidate, book] of BOOK_LOOKUP_INDEX.entries()) {
    if (candidate.replace(/\s+/g, '') === compact) return book;
  }
  return null;
}

const BOOK_NAMES_SORTED = PROTESTANT_BIBLE_BOOKS.map((b) => b.name)
  .sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

const BIBLE_REF_REGEX = new RegExp(
  `\\b(${BOOK_NAMES_SORTED.join('|')})\\s+(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?)?\\b`,
  'gi'
);

export function extractIndonesianBibleReferences(
  script: string,
  extraReference?: string
): string[] {
  const combined = `${extraReference ?? ''}\n${script ?? ''}`;
  const seen = new Set<string>();
  const results: string[] = [];

  BIBLE_REF_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BIBLE_REF_REGEX.exec(combined)) !== null) {
    const book = resolveIndonesianBook(match[1]);
    if (!book) continue;
    const chapter = match[2];
    const startVerse = match[3];
    const endVerse = match[4];
    const formatted = startVerse
      ? endVerse
        ? `${book.name} ${chapter}:${startVerse}-${endVerse}`
        : `${book.name} ${chapter}:${startVerse}`
      : `${book.name} ${chapter}`;
    if (!seen.has(formatted)) {
      seen.add(formatted);
      results.push(formatted);
    }
  }
  return results;
}

export function parseLocalBibleJson(rawText: string): LocalBibleDatabase {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('File JSON Alkitab tidak valid atau rusak.');
  }

  const versesMap: Record<string, string> = {};
  const booksFound = new Set<string>();
  const chaptersFound = new Set<string>();

  let sourceName = 'Alkitab Terjemahan Baru (Lokal)';
  let publisher = 'Lembaga Alkitab Indonesia (LAI)';
  let year = '';
  let copyrightStatement =
    'Gunakan hanya untuk verifikasi lokal pribadi; jangan distribusikan ulang teks Alkitab tanpa izin pemegang hak cipta.';

  const addVerse = (bookNameRaw: unknown, chapterRaw: unknown, verseRaw: unknown, textRaw: unknown) => {
    const book = resolveIndonesianBook(String(bookNameRaw ?? ''));
    const chapter = Number(chapterRaw);
    const verse = Number(verseRaw);
    const text = String(textRaw ?? '').trim();
    if (!book || !Number.isFinite(chapter) || !Number.isFinite(verse) || chapter < 1 || verse < 1 || !text) {
      return;
    }
    versesMap[`${book.id}:${chapter}:${verse}`] = text;
    booksFound.add(book.id);
    chaptersFound.add(`${book.id}:${chapter}`);
  };

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (obj.metadata && typeof obj.metadata === 'object') {
      const meta = obj.metadata as Record<string, unknown>;
      if (typeof meta.name === 'string' && meta.name.trim()) sourceName = meta.name.trim();
      if (typeof meta.publisher === 'string' && meta.publisher.trim()) publisher = meta.publisher.trim();
      if (typeof meta.year === 'string' || typeof meta.year === 'number') year = String(meta.year);
      if (typeof meta.copyright_statement === 'string' && meta.copyright_statement.trim()) {
        copyrightStatement = meta.copyright_statement.trim();
      } else if (typeof meta.copyright === 'string' && meta.copyright.trim()) {
        copyrightStatement = meta.copyright.trim();
      }
    }

    if (Array.isArray(obj.verses)) {
      for (const item of obj.verses) {
        if (!item || typeof item !== 'object') continue;
        const v = item as Record<string, unknown>;
        addVerse(
          v.book_name ?? v.book ?? v.kitab,
          v.chapter ?? v.pasal,
          v.verse ?? v.ayat,
          v.text ?? v.teks
        );
      }
    } else if (Array.isArray(obj.data)) {
      for (const item of obj.data) {
        if (!item || typeof item !== 'object') continue;
        const v = item as Record<string, unknown>;
        addVerse(
          v.book_name ?? v.book ?? v.kitab,
          v.chapter ?? v.pasal,
          v.verse ?? v.ayat,
          v.text ?? v.teks
        );
      }
    }
  } else if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const v = item as Record<string, unknown>;
      addVerse(
        v.book_name ?? v.book ?? v.kitab,
        v.chapter ?? v.pasal,
        v.verse ?? v.ayat,
        v.text ?? v.teks
      );
    }
  }

  const indexedVerseCount = Object.keys(versesMap).length;
  if (indexedVerseCount === 0) {
    throw new Error(
      'Tidak ditemukan ayat yang cocok. Pastikan format sesuai indo_tb.json ({ metadata, verses[] }) atau array { kitab, pasal, ayat, teks }.'
    );
  }

  return {
    versesMap,
    report: {
      indexedVerseCount,
      bookCount: booksFound.size,
      chapterCount: chaptersFound.size,
      missingBookCount: Math.max(0, 66 - booksFound.size),
      sourceName,
      publisher,
      year,
      copyrightStatement,
    },
  };
}

export function lookupLocalBibleReference(
  versesMap: Record<string, string>,
  reference: string
): LocalVerseLookupResult {
  const trimmed = reference.trim();
  const match = /^(.+?)\s+(\d{1,3})(?::(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?)?$/.exec(trimmed);
  if (!match) {
    return { reference: trimmed, found: false, verses: [], missingRefs: [trimmed] };
  }
  const book = resolveIndonesianBook(match[1]);
  if (!book) {
    return { reference: trimmed, found: false, verses: [], missingRefs: [trimmed] };
  }
  const chapter = Number(match[2]);
  const startVerse = match[3] ? Number(match[3]) : null;
  const endVerse = match[4] ? Number(match[4]) : startVerse;

  const verses: Array<{ ref: string; text: string }> = [];
  const missingRefs: string[] = [];

  if (startVerse !== null && endVerse !== null) {
    const low = Math.min(startVerse, endVerse);
    const high = Math.min(low + 24, Math.max(startVerse, endVerse));
    for (let v = low; v <= high; v++) {
      const key = `${book.id}:${chapter}:${v}`;
      const text = versesMap[key];
      if (text) {
        verses.push({ ref: `${book.name} ${chapter}:${v}`, text });
      } else {
        missingRefs.push(`${book.name} ${chapter}:${v}`);
      }
    }
  } else {
    // Whole chapter lookup (cap first 10 verses for prompt context)
    for (let v = 1; v <= 10; v++) {
      const key = `${book.id}:${chapter}:${v}`;
      const text = versesMap[key];
      if (text) {
        verses.push({ ref: `${book.name} ${chapter}:${v}`, text });
      }
    }
    if (verses.length === 0) {
      missingRefs.push(`${book.name} ${chapter}`);
    }
  }

  return {
    reference: trimmed,
    found: verses.length > 0 && missingRefs.length === 0,
    verses,
    missingRefs,
  };
}

function formatSrtTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const totalMs = Math.round(clamped * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const hours = Math.floor(totalMin / 60);
  return `${String(hours).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function buildSrtFromScenes(
  scenes: StoryboardScene[],
  totalDurationSeconds: number
): string {
  const validScenes = scenes.filter((s) => s.narrationSegment.trim().length > 0);
  if (validScenes.length === 0) return '';

  const weights = validScenes.map((s) => Math.max(3, s.narrationSegment.trim().split(/\s+/).length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let cursor = 0;
  const blocks: string[] = [];

  validScenes.forEach((scene, index) => {
    const share = (weights[index] / totalWeight) * totalDurationSeconds;
    const start = cursor;
    const end =
      index === validScenes.length - 1
        ? totalDurationSeconds
        : Math.min(totalDurationSeconds, start + share);
    cursor = end;

    blocks.push(
      `${index + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${scene.narrationSegment.trim()}`
    );
  });

  return `${blocks.join('\n\n')}\n`;
}

export function enforceThreeSentenceCap(reply: string): string {
  const cleaned = reply.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.slice(0, 3).join(' ');
}

export function validateShortsBrief(input: {
  channelId: string;
  title: string;
  durationSeconds: number;
}): { ok: true } | { ok: false; error: string } {
  const validChannel = YOUTUBE_CHANNELS.some((c) => c.id === input.channelId);
  if (!validChannel) {
    return { ok: false, error: 'Pilih salah satu dari 3 channel YouTube Shorts.' };
  }
  const title = input.title.trim();
  if (title.length < 3 || title.length > 120) {
    return { ok: false, error: 'Topik video harus 3–120 karakter.' };
  }
  if (
    input.durationSeconds !== 30 &&
    input.durationSeconds !== 45 &&
    input.durationSeconds !== 60 &&
    input.durationSeconds !== 170
  ) {
    return { ok: false, error: 'Durasi harus 30, 45, 60, atau 170 detik (2m 50d).' };
  }
  return { ok: true };
}

export function canMarkReadyToPublish(pkg: Pick<ShortsPackage, 'theologicalGuardian' | 'pastoralSensitivity'>): boolean {
  return (
    pkg.theologicalGuardian.status === 'LULUS' &&
    pkg.pastoralSensitivity.status === 'LULUS'
  );
}

export function createInitialShortsQueue(): ShortsQueueItem[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'seed-bs3d-1',
      channelId: 'bible-stories-3d',
      title: 'Ep. 01 — Kejadian 1: Penciptaan Dunia (1 Pasal = 1 Cerita)',
      bibleReference: 'Kejadian 1',
      durationSeconds: 170,
      notes: '17 adegan × 10 detik (2m 50d), percakapan masuk narasi audio, bersambung ke Kejadian 2.',
      stage: 'Ide',
      guardianStatus: 'BELUM DICEK',
      updatedAt: now,
    },
    {
      id: 'seed-dfi-1',
      channelId: 'daily-faith-inspiration',
      title: 'Saat Doa Terasa Lama Dijawab (Renungan 2m 50d)',
      bibleReference: 'Mazmur 27:14',
      durationSeconds: 170,
      notes: 'Renungan harian 2m 50d berbasis Master Alkitab TB & sumber valid LAI dengan animasi latar selaras isi.',
      stage: 'Ide',
      guardianStatus: 'BELUM DICEK',
      updatedAt: now,
    },
    {
      id: 'seed-bfm-1',
      channelId: 'bible-facts-mysteries',
      title: 'Prasasti Tel Dan & Makna Kata Ibrani "Hesed" (Maks 2m 50d)',
      bibleReference: '2 Samuel 7 & Mazmur 136',
      durationSeconds: 170,
      notes: 'Bukti arkeologi & bahasa asli Ibrani/Yunani dengan animasi menyerupai objek riset (17×10d).',
      stage: 'Ide',
      guardianStatus: 'BELUM DICEK',
      updatedAt: now,
    },
  ];
}
