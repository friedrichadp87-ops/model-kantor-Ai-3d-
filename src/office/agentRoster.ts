import type { AgentId, OfficeSimulationState, OfficeZoneId } from './types';
import type { WorkspaceDivisionId } from './workspaceDivisions';

export type SpecialistAgentId = AgentId;

export type AgentGroupFilter =
  | 'all'
  | 'pimpinan-riset'
  | 'penjaga-pastoral'
  | 'visual-video'
  | 'publikasi-doa';

export interface SpecialistAgentProfile {
  id: AgentId;
  personName: string;
  roleTitle: string;
  jobTitleId: string;
  summary: string;
  responsibilities: string[];
  group: Exclude<AgentGroupFilter, 'all'>;
  divisionId: WorkspaceDivisionId;
  divisionLabel: string;
  officeZone: Exclude<OfficeZoneId, 'overview'>;
  accentHex: string;
  samplePrompt: string;
}

export const AGENT_GROUP_LABELS: Record<AgentGroupFilter, string> = {
  all: 'Semua (13)',
  'pimpinan-riset': 'Pimpinan & Riset',
  'penjaga-pastoral': 'Penjaga & Pastoral',
  'visual-video': 'Visual & Video',
  'publikasi-doa': 'Publikasi & Doa',
};

export const SPECIALIST_AGENTS: SpecialistAgentProfile[] = [
  {
    id: 'ceo',
    personName: 'Elena Pratama',
    roleTitle: 'CEO Agent',
    jobTitleId: 'Kepala Koordinator & Pembagian Tugas',
    summary: 'Koordinasi dan pembagian tugas',
    responsibilities: [
      'Menentukan prioritas produksi harian untuk 3 channel YouTube Shorts.',
      'Membagi alur kerja lintas divisi dari riset hingga siap publikasi.',
      'Menjaga kepatuhan operasional WIB dan jeda Istirahat Minggu 06:00–15:00.',
    ],
    group: 'pimpinan-riset',
    divisionId: 'dashboard',
    divisionLabel: 'Pusat Komando 3D',
    officeZone: 'rapat',
    accentHex: '#38bdf8',
    samplePrompt: 'Susun pembagian prioritas kerja hari ini untuk 3 channel YouTube Shorts kami',
  },
  {
    id: 'trend-researcher',
    personName: 'Raka Mahendra',
    roleTitle: 'Trend Researcher',
    jobTitleId: 'Peneliti Ide & Kalender Editorial',
    summary: 'Sudut ide dan kalender editorial; bukan data tren live',
    responsibilities: [
      'Merancang sudut topik tematik mingguan untuk 3 channel tanpa mengarang data live.',
      'Menyusun kalender editorial yang selaras dengan hari raya & tema kehidupan nyata.',
      'Mengusulkan variasi hook pembuka agar tiap channel memiliki karakter kuat.',
    ],
    group: 'pimpinan-riset',
    divisionId: 'channel-youtube',
    divisionLabel: 'Channel YouTube',
    officeZone: 'riset',
    accentHex: '#60a5fa',
    samplePrompt: 'Berikan 4 sudut ide kalender editorial minggu depan untuk channel Daily Faith Inspiration',
  },
  {
    id: 'bible-researcher',
    personName: 'Aria Santoso',
    roleTitle: 'Bible Researcher',
    jobTitleId: 'Peneliti Sumber & Konteks Alkitab',
    summary: 'Pemeriksaan sumber dan konteks Alkitab',
    responsibilities: [
      'Memeriksa rujukan kitab, pasal, dan ayat dari Alkitab Terjemahan Baru (TB).',
      'Menyusun seri kanon 66 kitab (1.189 pasal) beserta latar sejarah & tokohnya.',
      'Memastikan tidak ada klaim alkitabiah atau sejarah yang keliru sebelum penulisan naskah.',
    ],
    group: 'pimpinan-riset',
    divisionId: 'bible-series',
    divisionLabel: 'Bible Series',
    officeZone: 'riset',
    accentHex: '#f59e0b',
    samplePrompt: 'Jelaskan konteks sejarah dan makna utama Mazmur 23:1-4 untuk episode Shorts 45 detik',
  },
  {
    id: 'scriptwriter',
    personName: 'Nadia Kusuma',
    roleTitle: 'Scriptwriter',
    jobTitleId: 'Penulis Naskah, Hook & Penutup',
    summary: 'Naskah, hook, dan penutup',
    responsibilities: [
      'Menulis hook 3 detik pertama yang hangat dan langsung relevan bagi penonton Shorts.',
      'Menyesuaikan jumlah kata naskah dengan durasi 30, 45, atau 60 detik per channel.',
      'Merangkai penutup reflektif dan ajakan interaksi (CTA) yang tulus.',
    ],
    group: 'pimpinan-riset',
    divisionId: 'produksi-konten',
    divisionLabel: 'Produksi Konten',
    officeZone: 'riset',
    accentHex: '#fb923c',
    samplePrompt: 'Tuliskan 3 pilihan hook 3 detik dan penutup doa singkat tentang ketenangan hati',
  },
  {
    id: 'theological-guardian',
    personName: 'Dharma Wijaya',
    roleTitle: 'Theological Guardian',
    jobTitleId: 'Penjaga Doktrin & Verifikator Ayat TB',
    summary: 'Ayat TB, konteks, doktrin, dan fakta sejarah',
    responsibilities: [
      'Mengaudit ketepatan kutipan ayat TB dan konteks perikop secara ketat.',
      'Memblokir konten yang menyimpang dari doktrin atau mencampur fakta sejarah.',
      'Menjadi gerbang utama sebelum pekerjaan dapat berstatus Siap Publikasi.',
    ],
    group: 'penjaga-pastoral',
    divisionId: 'guardian-komunitas',
    divisionLabel: 'Guardian & Komunitas',
    officeZone: 'riset',
    accentHex: '#818cf8',
    samplePrompt: 'Audit risiko tafsir keluar konteks pada topik Filipi 4:13 untuk konten Shorts singkat',
  },
  {
    id: 'pastoral-checker',
    personName: 'Clara Hartono',
    roleTitle: 'Pastoral Sensitivity Checker',
    jobTitleId: 'Pemeriksa Kepekaan Pastoral & Nada Bahasa',
    summary: 'Bahasa yang menguatkan dan tidak menghakimi',
    responsibilities: [
      'Meninjau pilihan kata agar hangat, berempati, dan tidak terkesan menggurui.',
      'Mendeteksi topik sensitif (duka, kecemasan, krisis) agar diarahkan secara bijak.',
      'Memastikan setiap penutup menguatkan iman pendengar dari berbagai latar belakang.',
    ],
    group: 'penjaga-pastoral',
    divisionId: 'guardian-komunitas',
    divisionLabel: 'Guardian & Komunitas',
    officeZone: 'riset',
    accentHex: '#facc15',
    samplePrompt: 'Tinjau nada bahasa pastoral agar pesan tentang kegagalan terasa hangat dan menguatkan',
  },
  {
    id: 'storyboard-artist',
    personName: 'Citra Lestari',
    roleTitle: 'Storyboard Artist',
    jobTitleId: 'Pengarah Urutan Adegan & Visual 9:16',
    summary: 'Urutan adegan dan arahan visual',
    responsibilities: [
      'Memecah naskah menjadi 4–6 adegan vertikal 9:16 dengan ritme pergantian shot rapi.',
      'Menentukan komposisi kamera, pencahayaan, dan gaya visual khas tiap channel.',
      'Menyiapkan prompt adegan kunci untuk diteruskan ke Studio Media AI.',
    ],
    group: 'visual-video',
    divisionId: 'produksi-konten',
    divisionLabel: 'Produksi Konten',
    officeZone: 'kode',
    accentHex: '#14b8a6',
    samplePrompt: 'Susun 4 urutan adegan 9:16 sinematik untuk kisah Daud menghadapi Goliat',
  },
  {
    id: 'visual-curator',
    personName: 'Kevin Suryadi',
    roleTitle: 'Visual Curator',
    jobTitleId: 'Kurator Aset Visual Openverse CC0 / CC-BY',
    summary: 'Kurasi aset Openverse CC0 / CC-BY',
    responsibilities: [
      'Mengkurasi referensi gambar & ilustrasi berlisensi aman (Openverse CC0 / CC-BY).',
      'Mencatat atribusi kreator dengan benar untuk kepatuhan hak cipta YouTube.',
      'Menjaga konsistensi warna dan nuansa visual antar-episode dalam satu seri.',
    ],
    group: 'visual-video',
    divisionId: 'video-editor',
    divisionLabel: 'Video Editor',
    officeZone: 'kode',
    accentHex: '#34d399',
    samplePrompt: 'Rekomendasikan kata kunci pencarian aset CC0/CC-BY dan catatan atribusi untuk tema Yerusalem kuno',
  },
  {
    id: 'video-composer',
    personName: 'Bima Saputra',
    roleTitle: 'Video Composer',
    jobTitleId: 'Perakit Visual, Audio & Format Vertikal',
    summary: 'Merakit visual, audio, dan format vertikal',
    responsibilities: [
      'Menggabungkan lapisan visual 9:16, audio narasi, dan musik latar ke komposisi akhir.',
      'Menjaga safe-zone teks Shorts agar tidak tertutup tombol antarmuka YouTube.',
      'Mengelola preset template produksi & integrasi proyeksi layar 3D studio.',
    ],
    group: 'visual-video',
    divisionId: 'pengaturan',
    divisionLabel: 'Pengaturan',
    officeZone: 'kode',
    accentHex: '#3b82f6',
    samplePrompt: 'Berikan checklist teknis merakit video vertikal 9:16 (1080x1920) dengan safe-zone subtitle',
  },
  {
    id: 'voice-artist',
    personName: 'Sora Permata',
    roleTitle: 'Voice Artist',
    jobTitleId: 'Pengarah Narasi & Karakter Suara',
    summary: 'Narasi dan karakter suara',
    responsibilities: [
      'Menentukan tempo bicara, jeda napas, dan intonasi hangat sesuai karakter channel.',
      'Menandai penekanan kata kunci (emphasis) pada kutipan ayat dan kalimat klimaks.',
      'Menyelaraskan durasi sulih suara agar tepat dengan target 30–60 detik.',
    ],
    group: 'visual-video',
    divisionId: 'church-shorts',
    divisionLabel: 'Church Shorts',
    officeZone: 'rapat',
    accentHex: '#c084fc',
    samplePrompt: 'Buat arahan intonasi dan jeda narasi 45 detik untuk renungan pagi yang menenangkan',
  },
  {
    id: 'video-editor',
    personName: 'Reza Nugroho',
    roleTitle: 'Video Editor',
    jobTitleId: 'Editor Potongan Video, Subtitle & Audio',
    summary: 'Editing, subtitle, dan audio',
    responsibilities: [
      'Memotong klip khotbah (Church Shorts) pada momen paling berdampak di 3 detik awal.',
      'Menyusun subtitle SRT yang sinkron, terbaca jelas, dan bebas typo.',
      'Menyeimbangkan level audio vokal dan musik latar agar jernih di speaker ponsel.',
    ],
    group: 'visual-video',
    divisionId: 'video-editor',
    divisionLabel: 'Video Editor',
    officeZone: 'kode',
    accentHex: '#f43f5e',
    samplePrompt: 'Susun panduan ritme potongan (cut pacing) dan gaya subtitle untuk klip khotbah 45 detik',
  },
  {
    id: 'seo-publisher',
    personName: 'Tania Wibowo',
    roleTitle: 'SEO & Publisher',
    jobTitleId: 'Spesialis Metadata, Publikasi & Analitik',
    summary: 'Metadata, publikasi, dan analitik',
    responsibilities: [
      'Menyusun judul, deskripsi, dan hashtag YouTube Shorts yang relevan dan natural.',
      'Mengatur slot jadwal publikasi mingguan WIB di luar jam Istirahat Minggu.',
      'Mengevaluasi laporan kinerja 3 channel dan rasio kelulusan Guardian.',
    ],
    group: 'publikasi-doa',
    divisionId: 'jadwal-publikasi',
    divisionLabel: 'Jadwal Publikasi',
    officeZone: 'server',
    accentHex: '#0ea5e9',
    samplePrompt: 'Buatkan 3 opsi judul SEO dan 5 hashtag YouTube Shorts untuk seri Fakta & Misteri Alkitab',
  },
  {
    id: 'community-prayer',
    personName: 'Hanna Setiawan',
    roleTitle: 'Community / Prayer Manager',
    jobTitleId: 'Pengelola Balasan Komentar & Permintaan Doa',
    summary: 'Draf balasan komentar dan permintaan doa',
    responsibilities: [
      'Menyiapkan draf balasan komentar yang ramah, ringkas (maks. 3 kalimat), dan penuh kasih.',
      'Mengenali permintaan doa atau sinyal krisis (care flag) untuk pendampingan pastoral.',
      'Menjaga etika komunitas agar ruang komentar menjadi tempat yang aman dan membangun.',
    ],
    group: 'publikasi-doa',
    divisionId: 'guardian-komunitas',
    divisionLabel: 'Guardian & Komunitas',
    officeZone: 'riset',
    accentHex: '#fbbf24',
    samplePrompt: 'Buatkan draf balasan hangat maksimal 3 kalimat untuk penonton yang meminta dukungan doa keluarga',
  },
];

export function getSpecialistById(id: string): SpecialistAgentProfile | undefined {
  return SPECIALIST_AGENTS.find((a) => a.id === id);
}

export function filterSpecialists(
  agents: SpecialistAgentProfile[],
  group: AgentGroupFilter,
  query: string
): SpecialistAgentProfile[] {
  const normalizedQuery = query.trim().toLowerCase();
  return agents.filter((agent) => {
    if (group !== 'all' && agent.group !== group) {
      return false;
    }
    if (!normalizedQuery) return true;
    const haystack = [
      agent.personName,
      agent.roleTitle,
      agent.jobTitleId,
      agent.summary,
      agent.divisionLabel,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function getSpecialistLiveStatus(
  specialist: SpecialistAgentProfile,
  simState: OfficeSimulationState
): { code: 'working' | 'ready'; label: string } {
  const runtime = simState.agents[specialist.id];
  if (runtime && (runtime.activeTaskId || runtime.activity === 'executing_task')) {
    return { code: 'working', label: 'Bekerja' };
  }
  return { code: 'ready', label: 'Siap' };
}
