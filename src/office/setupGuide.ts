export const SETUP_GUIDE_STORAGE_KEY = 'kantor_ai_setup_guide_dismissed_v1';
export const AI_STUDIO_API_KEY_URL = 'https://aistudio.google.com/apikey';
export const FIREBASE_CONSOLE_BASE_URL = 'https://console.firebase.google.com';

export interface SecretEnvVarGuide {
  key: string;
  label: string;
  scope: string;
  required: boolean;
}

export interface SetupGuideStep {
  id: 'get-gemini-key' | 'set-secrets' | 'sync-firebase';
  stepNumber: number;
  title: string;
  summary: string;
  bullets: string[];
}

export const GEMINI_SECRET_VARIABLES: readonly SecretEnvVarGuide[] = [
  {
    key: 'GEMINI_API_KEY',
    label: 'Kunci Utama (Global)',
    scope: 'Dipakai seluruh 39 agen di Lantai 1, 2 & 3 sebagai kunci utama/cadangan',
    required: true,
  },
  {
    key: 'GEMINI_API_KEY_DAILY_FAITH',
    label: 'Lantai 1 · Daily Faith & Inspiration',
    scope: 'Opsional — isolasi kuota renungan harian Lantai 1',
    required: false,
  },
  {
    key: 'GEMINI_API_KEY_STORIES_3D',
    label: 'Lantai 2 · Bible Stories 3D',
    scope: 'Opsional — isolasi kuota cerita Alkitab 3D Lantai 2',
    required: false,
  },
  {
    key: 'GEMINI_API_KEY_FACTS_MYSTERIES',
    label: 'Lantai 3 · Bible Facts & Mysteries',
    scope: 'Opsional — isolasi kuota riset fakta & misteri Lantai 3',
    required: false,
  },
] as const;

export const SETUP_GUIDE_STEPS: readonly SetupGuideStep[] = [
  {
    id: 'get-gemini-key',
    stepNumber: 1,
    title: 'Dapatkan Gemini API Key dari Google AI Studio',
    summary: 'Buat kunci API gratis atau berbayar yang terhubung ke project Google Cloud / Firebase Anda.',
    bullets: [
      'Buka halaman Google AI Studio API Keys (aistudio.google.com/apikey) lalu login menggunakan akun Google Anda.',
      'Klik tombol "Create API key", lalu pilih project Google Cloud yang terhubung dengan Firebase Anda (misal: kantor-ai-agent-creator).',
      'Salin kunci API yang tampil (diawali huruf AIza...) dan simpan di tempat aman — jangan dibagikan ke publik atau dimasukkan ke kode browser.',
    ],
  },
  {
    id: 'set-secrets',
    stepNumber: 2,
    title: 'Masukkan ke Panel Settings > Secrets (Firebase / AI Studio / Netlify)',
    summary: 'Simpan kunci API di sisi server agar agen AI Kantor 3D bisa memanggil Gemini secara aman.',
    bullets: [
      'Di Project Firebase / AI Studio: buka menu Settings (ikon gerigi) → Secrets (atau Firebase Console → Project Settings / App Hosting → Secrets), klik Add secret, isi nama variabel GEMINI_API_KEY, lalu tempel API key Anda dan simpan.',
      'Di Netlify (officecontent.netlify.app): buka Dashboard Netlify → Site configuration → Environment variables → Add a variable, isi GEMINI_API_KEY, lalu klik Trigger deploy agar fungsi server langsung membaca kunci baru.',
      'Opsional: tambahkan 3 variabel khusus lantai di bawah agar tiap channel YouTube memakai kuota API key masing-masing.',
    ],
  },
  {
    id: 'sync-firebase',
    stepNumber: 3,
    title: 'Sinkronkan Akun Firebase & Uji Koneksi di Kantor AI',
    summary: 'Hubungkan akun Anda ke project Firebase agar Master Alkitab TB, template, dan antrean konten tersimpan di cloud.',
    bullets: [
      'Klik tombol "Masuk Firebase" di bagian bawah sidebar kiri, lalu login dengan akun Google yang terdaftar pada project Firebase Anda.',
      'Buka menu Pengaturan → Gemini API, lalu tekan "Uji Koneksi Gemini" untuk memastikan variabel GEMINI_API_KEY sudah terbaca aktif oleh server.',
      'Setelah terhubung, unggah 1 file Master Alkitab Terjemahan Baru (.json/.txt) di menu Lantai 1–3 agar otomatis tersimpan di Cloud Firestore untuk semua perangkat.',
    ],
  },
] as const;

export function shouldAutoOpenSetupGuide(options: {
  dismissedFlag: string | null;
  searchQuery: string;
}): boolean {
  const params = new URLSearchParams(options.searchQuery || '');
  if (params.get('autostart') === '1') {
    return false;
  }
  return options.dismissedFlag !== 'true';
}

export function computeChecklistProgress(
  checkedIds: readonly string[],
  totalSteps = SETUP_GUIDE_STEPS.length
): { completed: number; total: number; percent: number } {
  const safeTotal = Math.max(1, totalSteps);
  const uniqueValid = new Set(
    checkedIds.filter((id) => SETUP_GUIDE_STEPS.some((step) => step.id === id))
  );
  const completed = Math.min(safeTotal, uniqueValid.size);
  return {
    completed,
    total: safeTotal,
    percent: Math.round((completed / safeTotal) * 100),
  };
}

export function readSetupGuideDismissed(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(SETUP_GUIDE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeSetupGuideDismissed(dismissed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (dismissed) {
      window.localStorage.setItem(SETUP_GUIDE_STORAGE_KEY, 'true');
    } else {
      window.localStorage.removeItem(SETUP_GUIDE_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restrictions
  }
}
