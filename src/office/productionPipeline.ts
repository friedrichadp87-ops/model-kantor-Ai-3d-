import type { AgentId } from './types';
import type { GuardianVerdict, ShortsChannelId, ShortsDuration } from './shortsFactory';
import type { AvSyncCheckReport } from './floor2And3Workflows';

export type PipelineStageId =
  | 'story_plan'
  | 'script_arc'
  | 'timestamps'
  | 'keyframes'
  | 'animations'
  | 'narration_audio'
  | 'av_sync_check'
  | 'assemble_video'
  | 'final_qc';

export type PipelineStageStatus = 'pending' | 'running' | 'completed' | 'warning' | 'error';

export type PipelineSceneCount = 3 | 4 | 5 | 6 | 17;

export type SceneAnimationMode = 'keyframe_to_video' | 'keyframe_kenburns';

export interface ChannelKeyRoutingDescriptor {
  channelId: ShortsChannelId;
  channelLabel: string;
  geminiEnvVar: string;
  elevenLabsEnvVar: string;
  voicePresetId: string;
  voicePresetName: string;
}

export const CHANNEL_KEY_ROUTING: Record<ShortsChannelId, ChannelKeyRoutingDescriptor> = {
  'bible-stories-3d': {
    channelId: 'bible-stories-3d',
    channelLabel: 'Bible Stories 3D',
    geminiEnvVar: 'GEMINI_API_KEY_STORIES_3D',
    elevenLabsEnvVar: 'ELEVENLABS_API_KEY_STORIES_3D',
    voicePresetId: 'EXAVITQu4vr4xnSDxMaL',
    voicePresetName: 'Bella (Cerita Anak 3D)',
  },
  'daily-faith-inspiration': {
    channelId: 'daily-faith-inspiration',
    channelLabel: 'Daily Faith & Inspiration',
    geminiEnvVar: 'GEMINI_API_KEY_DAILY_FAITH',
    elevenLabsEnvVar: 'ELEVENLABS_API_KEY_DAILY_FAITH',
    voicePresetId: 'ErXwobaYiN019PkySvjV',
    voicePresetName: 'Antoni (Renungan Tenang)',
  },
  'bible-facts-mysteries': {
    channelId: 'bible-facts-mysteries',
    channelLabel: 'Bible Facts & Mysteries',
    geminiEnvVar: 'GEMINI_API_KEY_FACTS_MYSTERIES',
    elevenLabsEnvVar: 'ELEVENLABS_API_KEY_FACTS_MYSTERIES',
    voicePresetId: 'pNInz6obpgDQGcFmaJgB',
    voicePresetName: 'Adam (Dokumenter / Fakta)',
  },
};

export interface ChannelKeySlotStatus {
  floorId?: 1 | 2 | 3;
  floorLabel?: string;
  channelId: ShortsChannelId;
  channelLabel: string;
  geminiEnvVar: string;
  geminiSource: 'dedicated' | 'fallback_global' | 'missing';
  elevenLabsEnvVar: string;
  elevenLabsSource: 'dedicated' | 'fallback_global' | 'missing';
}

export interface PipelineStageDefinition {
  id: PipelineStageId;
  order: number;
  title: string;
  subtitle: string;
  leadAgentId: AgentId;
  supportAgentIds: AgentId[];
  deliverableLabel: string;
}

export interface ChannelWorkflowBlueprint {
  channelId: ShortsChannelId;
  workflowTitle: string;
  summary: string;
  defaultBookScope: string;
  sampleCommands: Array<{
    label: string;
    command: string;
    bookScope: string;
    durationSeconds: ShortsDuration;
    sceneCount: PipelineSceneCount;
  }>;
  stages: PipelineStageDefinition[];
}

export const CHANNEL_WORKFLOW_BLUEPRINTS: Record<ShortsChannelId, ChannelWorkflowBlueprint> = {
  'bible-stories-3d': {
    channelId: 'bible-stories-3d',
    workflowTitle: 'Alur Cerita Alkitab 3D Kejadian 1–Wahyu 22 (1 Pasal = 1 Cerita · 17×10d)',
    summary:
      'Merencanakan jumlah cerita dari Kejadian 1 hingga Wahyu 22 (1 pasal = 1 cerita meski bersambung ke pasal berikutnya), penulis lain menyusun cerita lengkap beserta percakapan masuk narasi audio, membagi timestamp 10 detik per adegan (17×10d = 2m 50d), membuat gambar patokan & animasi MP4, QC Tahap 1 cek kecocokan audio–video, penyatuan Editor, dan QC Tahap 2 cek kesesuaian rencana cerita.',
    defaultBookScope: 'Kejadian 1 — Episode #1/929 PL (1 Pasal = 1 Cerita)',
    sampleCommands: [
      {
        label: 'Ep. 01 — Kejadian 1 (1 Pasal = 1 Cerita · 17×10d)',
        command:
          'Buatkan cerita lengkap Bible Stories 3D khusus 1 pasal penuh yaitu Kejadian 1 (Episode #1 Perjanjian Lama) berlandaskan Master Alkitab Terjemahan Baru. Masukkan alur penciptaan lengkap beserta firman/percakapan langsung ke dalam narasi audio, bagi menjadi 17 adegan 10 detik (total 2 menit 50 detik), dan beri jembatan halus bersambung ke Kejadian 2.',
        bookScope: 'Kejadian 1 (Episode #1 · PL 929 Pasal)',
        durationSeconds: 170,
        sceneCount: 17,
      },
      {
        label: 'Ep. 02 — Kejadian 2 (Bersambung dari Pasal 1 · 17×10d)',
        command:
          'Buatkan cerita lengkap Bible Stories 3D khusus 1 pasal yaitu Kejadian 2 (Episode #2, bersambung dari Kejadian 1) tentang Taman Eden, penciptaan manusia, dan percakapan Tuhan dengan Adam yang dirangkai ke dalam narasi audio, dibagi menjadi 17 adegan × 10 detik (2 menit 50 detik).',
        bookScope: 'Kejadian 2 (Episode #2 · Bersambung ke Kejadian 3)',
        durationSeconds: 170,
        sceneCount: 17,
      },
      {
        label: '1 Samuel 17 — Daud & Goliat (1 Pasal · 17×10d)',
        command:
          'Produksi cerita 3D lengkap 1 pasal 1 Samuel 17 tentang Daud menghadapi Goliat, masukkan seluruh percakapan Daud, Saul, dan Goliat ke dalam narasi audio yang hidup, bagi menjadi 17 adegan berdurasi 10 detik (total 2 menit 50 detik) ramah keluarga.',
        bookScope: '1 Samuel 17 (1 Pasal = 1 Cerita)',
        durationSeconds: 170,
        sceneCount: 17,
      },
    ],
    stages: [
      {
        id: 'story_plan',
        order: 1,
        title: 'Perencanaan Seri Alkitab (Kejadian 1–Wahyu 22 · 1 Pasal = 1 Cerita)',
        subtitle:
          'Menghitung jumlah cerita (PL 929 pasal / PB 260 pasal / per kitab) dengan aturan 1 pasal = 1 cerita utuh meski bersambung ke pasal berikutnya',
        leadAgentId: 'bible-researcher',
        supportAgentIds: ['ceo'],
        deliverableLabel: 'Peta Jumlah Cerita & Episode',
      },
      {
        id: 'script_arc',
        order: 2,
        title: 'Jalan Cerita 1 Pasal + Percakapan Masuk Narasi Audio',
        subtitle:
          'Agen penulis (berbeda dari perencana) menyusun cerita lengkap 1 pasal beserta seluruh percakapan tokoh yang mengalir langsung untuk dieksekusi jadi audio',
        leadAgentId: 'scriptwriter',
        supportAgentIds: ['theological-guardian'],
        deliverableLabel: 'Naskah Cerita & Dialog Audio',
      },
      {
        id: 'timestamps',
        order: 3,
        title: 'Timestamp Adegan 10 Detik (17 Adegan × 10d = 2m 50d)',
        subtitle:
          'Memecah cerita & percakapan menjadi adegan 10 detik berurutan (00:00–02:50) lengkap dengan SRT dan instruksi produksi visual',
        leadAgentId: 'storyboard-artist',
        supportAgentIds: ['video-editor'],
        deliverableLabel: '17 Segmen × 10d & SRT',
      },
      {
        id: 'keyframes',
        order: 4,
        title: 'Gambar Patokan 3D per Adegan 10 Detik (9:16)',
        subtitle:
          'Menghasilkan gambar patokan karakter 3D yang konsisten dari adegan 1 sampai 17 sebelum dianimasikan menjadi MP4',
        leadAgentId: 'visual-curator',
        supportAgentIds: ['storyboard-artist'],
        deliverableLabel: 'Keyframe 3D 9:16',
      },
      {
        id: 'animations',
        order: 5,
        title: 'Produksi Video Animasi MP4 dari Gambar Patokan',
        subtitle:
          'Menerima catatan timestamp untuk menganimasikan tiap gambar patokan menjadi klip video MP4 10 detik per adegan',
        leadAgentId: 'video-composer',
        supportAgentIds: ['visual-curator'],
        deliverableLabel: 'Klip Animasi 10d MP4',
      },
      {
        id: 'narration_audio',
        order: 6,
        title: 'Eksekusi Audio Narasi & Percakapan Cerita (2m 50d)',
        subtitle:
          'Mengeksekusi naskah jalan cerita lengkap termasuk percakapan tokoh menjadi audio narasi MP3 yang hangat dan ekspresif',
        leadAgentId: 'voice-artist',
        supportAgentIds: ['scriptwriter'],
        deliverableLabel: 'Audio Narasi 2m 50d MP3',
      },
      {
        id: 'av_sync_check',
        order: 7,
        title: 'QC Tahap 1 · Cek Kecocokan Audio & Video per Adegan',
        subtitle:
          'Mencocokkan apakah audio narasi dan video animasi tiap adegan 10 detik sudah selaras sebelum memberi instruksi penyatuan ke Editor',
        leadAgentId: 'pastoral-checker',
        supportAgentIds: ['storyboard-artist'],
        deliverableLabel: 'Persetujuan Sinkron A/V',
      },
      {
        id: 'assemble_video',
        order: 8,
        title: 'Penyatuan Video Animasi & Narasi Audio oleh Editor',
        subtitle:
          'Setelah disetujui QC Tahap 1, Editor menyatukan seluruh adegan animasi 10 detik, audio narasi, dan subtitle menjadi 1 video MP4 utuh',
        leadAgentId: 'video-editor',
        supportAgentIds: ['video-composer'],
        deliverableLabel: 'Video Final 2m 50d MP4',
      },
      {
        id: 'final_qc',
        order: 9,
        title: 'QC Tahap 2 · QC Akhir Kesesuaian Rencana Cerita Alkitab',
        subtitle:
          'Mengecek video final apakah sudah berjalan sesuai rencana cerita Alkitab pertama dst., akurat dengan Master Alkitab TB, dan siap posting',
        leadAgentId: 'theological-guardian',
        supportAgentIds: ['pastoral-checker', 'seo-publisher'],
        deliverableLabel: 'Sertifikat QC & Siap Upload',
      },
    ],
  },
  'daily-faith-inspiration': {
    channelId: 'daily-faith-inspiration',
    workflowTitle: 'Alur Renungan Harian 2 Menit 50 Detik (Sumber Valid LAI & Alkitab TB)',
    summary:
      'Mengambil inspirasi renungan harian hanya dari sumber valid (LAI / renungan Kristen terverifikasi) berlandaskan Master Alkitab Terjemahan Baru, menyusun narasi penuh berkat ±2 menit 50 detik (170d), menyesuaikan animasi latar dengan isi renungan, cek kecocokan audio–visual, penyatuan Editor, dan audit QC Alkitab TB.',
    defaultBookScope: 'Master Alkitab TB · Renungan Harian (LAI)',
    sampleCommands: [
      {
        label: 'Renungan 2m 50d — Saat Doa Terasa Lama Dijawab (Mazmur 27:14)',
        command:
          'Susun renungan harian berdurasi 2 menit 50 detik (170 detik) berdasarkan Alkitab Terjemahan Baru Mazmur 27:14 tentang tetap berharap dan dikuatkan Tuhan saat doa terasa lama dijawab, sertakan animasi latar tenang yang selaras dengan setiap bagian renungan serta doa penutup yang memberkati.',
        bookScope: 'Mazmur 27:14',
        durationSeconds: 170,
        sceneCount: 6,
      },
      {
        label: 'Renungan 2m 50d — Damai di Tengah Kekhawatiran (Filipi 4:6-7)',
        command:
          'Buat renungan harian penuh berkat berdurasi 2 menit 50 detik (170 detik) dari Alkitab Terjemahan Baru Filipi 4:6-7 untuk pendengar yang sedang gelisah, lengkap dengan latar animasi cahaya fajar dan aliran air tenang yang mengikuti alur refleksi hingga doa penutup.',
        bookScope: 'Filipi 4:6-7',
        durationSeconds: 170,
        sceneCount: 6,
      },
    ],
    stages: [
      {
        id: 'story_plan',
        order: 1,
        title: 'Riset Sumber Renungan Valid (LAI) & Ayat Alkitab TB',
        subtitle:
          'Mengambil tema renungan harian hanya dari sumber valid (Lembaga Alkitab Indonesia / renungan terpercaya) dan mencocokkan ayat dari Master Alkitab Terjemahan Baru',
        leadAgentId: 'trend-researcher',
        supportAgentIds: ['bible-researcher'],
        deliverableLabel: 'Sumber Valid & Ayat TB',
      },
      {
        id: 'script_arc',
        order: 2,
        title: 'Naskah Renungan Harian Penuh Berkat (2m 50d)',
        subtitle:
          'Menulis narasi ±380 kata (2 menit 50 detik): sapaan empatik, pembacaan ayat TB, refleksi mendalam, aplikasi harian, dan doa penutup',
        leadAgentId: 'scriptwriter',
        supportAgentIds: ['pastoral-checker'],
        deliverableLabel: 'Naskah Renungan 2m 50d',
      },
      {
        id: 'timestamps',
        order: 3,
        title: 'Timestamp 00:00–02:50 & Pemetaan Latar Visual',
        subtitle:
          'Membagi durasi 170 detik menjadi 6 segmen SRT dan memetakan suasana animasi latar agar menyatu dengan pesan tiap bagian renungan',
        leadAgentId: 'storyboard-artist',
        supportAgentIds: ['video-editor'],
        deliverableLabel: 'Timeline 02:50 & SRT',
      },
      {
        id: 'keyframes',
        order: 4,
        title: 'Gambar Patokan Latar Sesuai Isi Renungan',
        subtitle:
          'Menghasilkan 6 gambar latar atmosferik yang mencerminkan metafora isi renungan (fajar pengharapan, lembah damai, cahaya doa)',
        leadAgentId: 'visual-curator',
        supportAgentIds: ['storyboard-artist'],
        deliverableLabel: '6 Keyframe Latar',
      },
      {
        id: 'animations',
        order: 5,
        title: 'Animasi Latar Lembut Selaras Isi Renungan',
        subtitle:
          'Menganimasikan setiap latar belakang dengan gerak tenang dan damai mengikuti ritme renungan sepanjang 2 menit 50 detik',
        leadAgentId: 'video-composer',
        supportAgentIds: ['visual-curator'],
        deliverableLabel: 'Klip Animasi Latar',
      },
      {
        id: 'narration_audio',
        order: 6,
        title: 'Audio Narasi Renungan Penuh Berkat (2m 50d)',
        subtitle:
          'Merekam suara narasi hangat, jernih, dan penuh empati sesuai ritme jeda 2 menit 50 detik agar pendengar terberkati',
        leadAgentId: 'voice-artist',
        supportAgentIds: ['pastoral-checker'],
        deliverableLabel: 'Audio Narasi 2m 50d',
      },
      {
        id: 'av_sync_check',
        order: 7,
        title: 'QC Tahap 1 · Cek Keselarasan Audio & Animasi Latar',
        subtitle:
          'Memastikan ritme audio renungan dan suasana 6 animasi latar sudah cocok sebelum Editor menggabungkannya',
        leadAgentId: 'pastoral-checker',
        supportAgentIds: ['storyboard-artist'],
        deliverableLabel: 'Persetujuan Sinkron A/V',
      },
      {
        id: 'assemble_video',
        order: 8,
        title: 'Penggabungan Animasi Latar + Narasi + Ayat TB',
        subtitle:
          'Menyatukan seluruh animasi latar, audio narasi 2 menit 50 detik, dan subtitle ayat Terjemahan Baru menjadi 1 video final',
        leadAgentId: 'video-editor',
        supportAgentIds: ['video-composer'],
        deliverableLabel: 'Video Renungan 2m 50d',
      },
      {
        id: 'final_qc',
        order: 9,
        title: 'QC Tahap 2 · QC Alkitab TB, Pastoral & Upload',
        subtitle:
          'Audit mutlak bahwa renungan 100% berlandaskan Master Alkitab TB, memberkati secara pastoral, dan metadata Daily Faith siap tayang',
        leadAgentId: 'theological-guardian',
        supportAgentIds: ['pastoral-checker', 'seo-publisher'],
        deliverableLabel: 'Sertifikat QC TB & Upload',
      },
    ],
  },
  'bible-facts-mysteries': {
    channelId: 'bible-facts-mysteries',
    workflowTitle: 'Alur Fakta, Bukti Peninggalan & Kata Ibrani/Yunani (Maks 2m 50d · 17×10d)',
    summary:
      'Tim riset mencari fakta Alkitab, bukti peninggalan arkeologi, kata Ibrani & Yunani yang sering salah diartikan, serta misteri tersembunyi berlandaskan Master Alkitab TB; memproduksi visual animasi menyerupai objek riset per 10 detik (maks 2m 50d), QC Tahap 1 cek kecocokan audio–visual, penyatuan Editor, dan QC Tahap 2.',
    defaultBookScope: 'Arkeologi, Kata Ibrani/Yunani & Misteri Alkitab',
    sampleCommands: [
      {
        label: 'Arkeologi — Prasasti Tel Dan & Bukti Raja Daud (2m 50d)',
        command:
          'Produksi dokumenter Bible Facts & Mysteries berdurasi 2 menit 50 detik (17 adegan × 10 detik) tentang Prasasti Tel Dan sebagai bukti peninggalan arkeologi eksistensi Raja Daud (2 Samuel 7), lengkap dengan visual animasi menyerupai prasasti batu kuno dan situs Israel sesuai riset.',
        bookScope: '2 Samuel 7 · Bukti Arkeologi Tel Dan',
        durationSeconds: 170,
        sceneCount: 17,
      },
      {
        label: 'Bahasa Asli — Kata Ibrani "Hesed" & Yunani "Tetelestai" (2m 50d)',
        command:
          'Buat dokumenter fakta Alkitab maksimal 2 menit 50 detik (17 adegan × 10 detik) yang mengupas arti sebenarnya kata Ibrani "Hesed" (Mazmur 136) dan kata Yunani "Tetelestai" (Yohanes 19:30) yang sering disalahartikan, dilengkapi visual animasi gulungan manuskrip kuno dan rekonstruksi zaman Alkitab.',
        bookScope: 'Mazmur 136 & Yohanes 19:30 · Kata Ibrani/Yunani',
        durationSeconds: 170,
        sceneCount: 17,
      },
      {
        label: 'Misteri — Manna Padang Gurun & Tembok Yerikho (2m 50d)',
        command:
          'Susun video misteri dan fakta Alkitab 2 menit 50 detik (17 adegan × 10 detik) tentang Tembok Kuno Yerikho (Yosua 6) dan Manna di Padang Gurun (Keluaran 16), menyajikan bukti teks Alkitab TB dan rekonstruksi visual menyerupai situs sejarah tanpa spekulasi liar.',
        bookScope: 'Yosua 6 & Keluaran 16 · Misteri Alkitab',
        durationSeconds: 170,
        sceneCount: 17,
      },
    ],
    stages: [
      {
        id: 'story_plan',
        order: 1,
        title: 'Riset Fakta Alkitab, Bukti Peninggalan & Kata Ibrani/Yunani',
        subtitle:
          'Mencari bukti arkeologi, situs peninggalan, makna kata Ibrani & Yunani yang sering salah diartikan, serta misteri Alkitab berbasis Master Alkitab TB',
        leadAgentId: 'bible-researcher',
        supportAgentIds: ['trend-researcher'],
        deliverableLabel: 'Dossier Fakta & Bukti',
      },
      {
        id: 'script_arc',
        order: 2,
        title: 'Naskah Dokumenter Fakta & Makna Kata Asli (≤2m 50d)',
        subtitle:
          'Menulis alur dokumenter menarik maksimal 2 menit 50 detik: misteri pembuka, bukti peninggalan / bahasa asli, dan kesimpulan Alkitab TB',
        leadAgentId: 'scriptwriter',
        supportAgentIds: ['theological-guardian'],
        deliverableLabel: 'Naskah Fakta & Misteri',
      },
      {
        id: 'timestamps',
        order: 3,
        title: 'Timestamp Adegan 10 Detik & Daftar Visual Bukti (17×10d)',
        subtitle:
          'Memecah narasi menjadi segmen 10 detik (maks 17 adegan = 2m 50d) dengan panduan visual menyerupai artefak, peta, atau manuskrip hasil riset',
        leadAgentId: 'storyboard-artist',
        supportAgentIds: ['video-editor'],
        deliverableLabel: 'Timeline 10d & SRT',
      },
      {
        id: 'keyframes',
        order: 4,
        title: 'Gambar Patokan Menyerupai Bukti Peninggalan & Manuskrip',
        subtitle:
          'Menghasilkan gambar patokan dokumenter 9:16 yang bentuknya menyerupai temuan arkeologi, situs kuno, dan gulungan Ibrani/Yunani yang diriset',
        leadAgentId: 'visual-curator',
        supportAgentIds: ['bible-researcher'],
        deliverableLabel: 'Keyframe Rekonstruksi',
      },
      {
        id: 'animations',
        order: 5,
        title: 'Animasi Visual Dokumenter Menyerupai Objek Riset',
        subtitle:
          'Menganimasikan rekonstruksi peninggalan sejarah, peta lokasi, dan adegan misteri per segmen 10 detik menjadi klip MP4',
        leadAgentId: 'video-composer',
        supportAgentIds: ['visual-curator'],
        deliverableLabel: 'Klip Animasi Fakta MP4',
      },
      {
        id: 'narration_audio',
        order: 6,
        title: 'Audio Narasi Dokumenter Fakta & Misteri (≤2m 50d)',
        subtitle:
          'Merekam suara narator dokumenter tegas dan informatif dengan pelafalan istilah Ibrani/Yunani yang jelas',
        leadAgentId: 'voice-artist',
        supportAgentIds: ['scriptwriter'],
        deliverableLabel: 'Audio Dokumenter MP3',
      },
      {
        id: 'av_sync_check',
        order: 7,
        title: 'QC Tahap 1 · Cek Kecocokan Audio & Visual per Adegan',
        subtitle:
          'Memastikan penjelasan fakta/bahasa asli di audio benar-benar cocok dengan visual bukti animasi tiap 10 detik sebelum Editor menyatukannya',
        leadAgentId: 'pastoral-checker',
        supportAgentIds: ['bible-researcher'],
        deliverableLabel: 'Persetujuan Sinkron A/V',
      },
      {
        id: 'assemble_video',
        order: 8,
        title: 'Penyatuan Video Fakta & Narasi Audio oleh Editor',
        subtitle:
          'Setelah lolos QC Tahap 1, Editor merakit semua adegan visual fakta, audio narasi, dan subtitle menjadi 1 video dokumenter MP4 final',
        leadAgentId: 'video-editor',
        supportAgentIds: ['video-composer'],
        deliverableLabel: 'Video Dokumenter MP4',
      },
      {
        id: 'final_qc',
        order: 9,
        title: 'QC Tahap 2 · QC Akhir Akurasi Fakta, Alkitab TB & Upload',
        subtitle:
          'Memastikan nol spekulasi liar, keakuratan bukti arkeologi & kata Ibrani/Yunani sesuai Master Alkitab TB, serta siap tayang YouTube',
        leadAgentId: 'theological-guardian',
        supportAgentIds: ['bible-researcher', 'seo-publisher'],
        deliverableLabel: 'Sertifikat QC & Siap Upload',
      },
    ],
  },
};

export interface OneCommandPipelineInput {
  channelId: ShortsChannelId;
  command: string;
  bookScope: string;
  durationSeconds: ShortsDuration;
  sceneCount: PipelineSceneCount;
  animationMode: SceneAnimationMode;
  generateAudio: boolean;
}

export interface PipelineStoryPlan {
  seriesTitle: string;
  episodeTitle: string;
  bookOrScope: string;
  sequencePosition: string;
  coreMessage: string;
  bibleReferences: string[];
  storyBeats: string[];
}

export interface PipelineScriptArc {
  hook: string;
  bodySummary: string;
  closingCta: string;
  fullNarrationScript: string;
  estimatedWordCount: number;
}

export interface PipelineSceneItem {
  sceneNumber: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  timecodeLabel: string;
  narrationText: string;
  visualDescription: string;
  keyframePrompt: string;
  animationPrompt: string;
  cameraMotion: string;
  keyframeStatus: PipelineStageStatus;
  keyframeDataUrl?: string;
  keyframeError?: string;
  animationStatus: PipelineStageStatus;
  videoDataUrl?: string;
  animationError?: string;
}

export interface PipelineYoutubeMetadata {
  seoTitle: string;
  description: string;
  hashtags: string[];
  madeForKids: boolean;
  targetChannelName: string;
}

export interface FinalQcCheckItem {
  id: string;
  label: string;
  passed: boolean;
  note: string;
}

export interface FinalQcReport {
  verdict: GuardianVerdict;
  planAlignmentScore: number;
  scriptMatch: boolean;
  theologicalPassed: boolean;
  pastoralPassed: boolean;
  readyForYoutubeUpload: boolean;
  summary: string;
  checks: FinalQcCheckItem[];
  revisionItems: string[];
  checkedAt: string;
}

export interface AssembledVideoArtifact {
  dataUrl: string;
  mimeType: string;
  totalDurationSec: number;
  sceneCount: number;
  hasAudio: boolean;
  fileSizeBytes: number;
  createdAt: string;
}

export interface PipelineRunState {
  id: string;
  input: OneCommandPipelineInput;
  startedAt: string;
  completedAt?: string;
  activeStageId: PipelineStageId | null;
  stageStatuses: Record<PipelineStageId, PipelineStageStatus>;
  stageNotes: Partial<Record<PipelineStageId, string>>;
  keySlotUsed?: string;
  providerUsed?: string;
  storyPlan?: PipelineStoryPlan;
  scriptArc?: PipelineScriptArc;
  scenes: PipelineSceneItem[];
  srtText: string;
  youtubeMetadata?: PipelineYoutubeMetadata;
  narrationAudioDataUrl?: string;
  narrationAudioNote?: string;
  avSyncCheck?: AvSyncCheckReport;
  assembledVideo?: AssembledVideoArtifact;
  finalQc?: FinalQcReport;
  errorMessage?: string;
}

export function resolveChannelKeySlot(channelId: ShortsChannelId): ChannelKeyRoutingDescriptor {
  return CHANNEL_KEY_ROUTING[channelId] ?? CHANNEL_KEY_ROUTING['bible-stories-3d'];
}

export function getChannelWorkflowBlueprint(channelId: ShortsChannelId): ChannelWorkflowBlueprint {
  return CHANNEL_WORKFLOW_BLUEPRINTS[channelId] ?? CHANNEL_WORKFLOW_BLUEPRINTS['bible-stories-3d'];
}

export function validateOneCommandInput(
  raw: Partial<OneCommandPipelineInput>
): { ok: true; value: OneCommandPipelineInput } | { ok: false; error: string } {
  const channelId = raw.channelId;
  if (
    channelId !== 'bible-stories-3d' &&
    channelId !== 'daily-faith-inspiration' &&
    channelId !== 'bible-facts-mysteries'
  ) {
    return { ok: false, error: 'Pilih salah satu dari 3 channel YouTube terlebih dahulu.' };
  }

  const command = String(raw.command ?? '').trim();
  if (command.length < 8) {
    return {
      ok: false,
      error: 'Masukkan perintah produksi minimal 8 karakter (contoh: topik cerita atau kitab Alkitab).',
    };
  }
  if (command.length > 600) {
    return { ok: false, error: 'Perintah produksi maksimal 600 karakter.' };
  }

  const bookScope = String(raw.bookScope ?? '').trim().slice(0, 140);
  const defaultDur: ShortsDuration = 170;
  const durationSeconds: ShortsDuration =
    raw.durationSeconds === 30 ||
    raw.durationSeconds === 45 ||
    raw.durationSeconds === 60 ||
    raw.durationSeconds === 170
      ? raw.durationSeconds
      : defaultDur;
  const defaultScenes: PipelineSceneCount =
    durationSeconds === 170
      ? channelId === 'daily-faith-inspiration'
        ? 6
        : 17
      : 4;
  const sceneCount: PipelineSceneCount =
    raw.sceneCount === 3 ||
    raw.sceneCount === 4 ||
    raw.sceneCount === 5 ||
    raw.sceneCount === 6 ||
    raw.sceneCount === 17
      ? raw.sceneCount
      : defaultScenes;
  const animationMode: SceneAnimationMode =
    raw.animationMode === 'keyframe_to_video' ? 'keyframe_to_video' : 'keyframe_kenburns';
  const generateAudio = raw.generateAudio !== false;

  return {
    ok: true,
    value: {
      channelId,
      command,
      bookScope,
      durationSeconds,
      sceneCount,
      animationMode,
      generateAudio,
    },
  };
}

export function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function formatSrtTimecode(totalSeconds: number): string {
  const safeMs = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(safeMs / 3600000);
  const minutes = Math.floor((safeMs % 3600000) / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const millis = safeMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
    seconds
  ).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export interface RawSceneBlueprint {
  sceneNumber?: number;
  narrationText?: string;
  visualDescription?: string;
  keyframePrompt?: string;
  animationPrompt?: string;
  cameraMotion?: string;
  durationSec?: number;
}

/**
 * Guarantees deterministic, contiguous, non-overlapping timestamps spanning exact `totalDuration`.
 * Supports 30–60s Shorts (3–6 scenes), 170s Daily Faith (6 atmospheric scenes), and
 * 170s (2m 50d) Bible Stories 3D / Bible Facts & Mysteries (17 scenes × 10 seconds each).
 */
export function normalizeTimestampedScenes(
  rawScenes: RawSceneBlueprint[],
  totalDuration: ShortsDuration,
  targetSceneCount: PipelineSceneCount
): PipelineSceneItem[] {
  const count = targetSceneCount === 17 ? 17 : Math.max(3, Math.min(6, targetSceneCount));
  const baseDur = Math.floor(totalDuration / count);
  let remainder = totalDuration - baseDur * count;
  const maxPerScene = totalDuration > 60 && count <= 6 ? 45 : 15;

  let cursor = 0;
  const result: PipelineSceneItem[] = [];

  for (let i = 0; i < count; i++) {
    const src = rawScenes[i] ?? {};
    const dur = Math.max(3, Math.min(maxPerScene, baseDur + (remainder > 0 ? 1 : 0)));
    if (remainder > 0) remainder -= 1;

    const startSec = cursor;
    const endSec = i === count - 1 ? totalDuration : Math.min(totalDuration, startSec + dur);
    const actualDur = Math.max(3, endSec - startSec);
    cursor = endSec;

    const narration =
      String(src.narrationText ?? '').trim() ||
      `Adegan ${i + 1}: Narasi lanjutan sesuai rencana cerita dan pesan iman episode ini.`;
    const visualDesc =
      String(src.visualDescription ?? '').trim() ||
      `Komposisi vertikal 9:16 untuk adegan ${i + 1} dengan pencahayaan sinematik hangat.`;
    const keyframePrompt =
      String(src.keyframePrompt ?? '').trim() ||
      `${visualDesc}, vertical 9:16 framing, consistent character design, clean cinematic lighting, no embedded text`;
    const animationPrompt =
      String(src.animationPrompt ?? '').trim() ||
      `Smooth subtle cinematic motion from the reference frame: ${visualDesc}, gentle camera movement, natural lighting, 9:16 vertical video`;
    const cameraMotion = String(src.cameraMotion ?? '').trim() || 'Slow cinematic push-in';

    result.push({
      sceneNumber: i + 1,
      startSec,
      endSec,
      durationSec: actualDur,
      timecodeLabel: `${formatMmSs(startSec)} – ${formatMmSs(endSec)}`,
      narrationText: narration,
      visualDescription: visualDesc,
      keyframePrompt,
      animationPrompt,
      cameraMotion,
      keyframeStatus: 'pending',
      animationStatus: 'pending',
    });
  }

  return result;
}

export function buildPipelineSrt(scenes: PipelineSceneItem[]): string {
  return scenes
    .map((scene, idx) => {
      const start = formatSrtTimecode(scene.startSec);
      const end = formatSrtTimecode(scene.endSec);
      return `${idx + 1}\n${start} --> ${end}\n${scene.narrationText.trim()}`;
    })
    .join('\n\n');
}

export function createInitialStageStatuses(): Record<PipelineStageId, PipelineStageStatus> {
  return {
    story_plan: 'pending',
    script_arc: 'pending',
    timestamps: 'pending',
    keyframes: 'pending',
    animations: 'pending',
    narration_audio: 'pending',
    av_sync_check: 'pending',
    assemble_video: 'pending',
    final_qc: 'pending',
  };
}

export function computePipelineProgress(stageStatuses: Record<PipelineStageId, PipelineStageStatus>): {
  completedCount: number;
  totalStages: number;
  percent: number;
} {
  const values = Object.values(stageStatuses);
  const totalStages = values.length;
  const completedCount = values.filter((s) => s === 'completed' || s === 'warning').length;
  return {
    completedCount,
    totalStages,
    percent: totalStages > 0 ? Math.round((completedCount / totalStages) * 100) : 0,
  };
}

export function evaluateFinalQcGate(input: {
  verdict: GuardianVerdict;
  planAlignmentScore: number;
  scriptMatch: boolean;
  theologicalPassed: boolean;
  pastoralPassed: boolean;
}): boolean {
  return (
    input.verdict === 'LULUS' &&
    input.planAlignmentScore >= 75 &&
    input.scriptMatch &&
    input.theologicalPassed &&
    input.pastoralPassed
  );
}
