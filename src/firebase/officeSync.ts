import type { ProviderConfig } from '../office/providerConfig';
import type { ChannelTemplatesMap, ShortsQueueItem } from '../office/shortsFactory';
import type { AgentId, TaskEntry } from '../office/types';

export const FIREBASE_PROJECT_ID = 'kantor-ai-agent-creator';

export const FIRESTORE_PATHS = {
  userDoc: (uid: string) => `users/${uid}`,
  workspaceSettingsDoc: (uid: string) => `users/${uid}/workspace/settings`,
  shortsQueueCollection: (uid: string) => `users/${uid}/shortsQueue`,
  shortsQueueDoc: (uid: string, itemId: string) => `users/${uid}/shortsQueue/${itemId}`,
  agentTasksCollection: (uid: string) => `users/${uid}/agentTasks`,
  agentTaskDoc: (uid: string, taskId: string) => `users/${uid}/agentTasks/${taskId}`,
} as const;

export interface FirebaseAuthUserSummary {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerIds: string[];
}

export interface SanitizedUserProfilePayload {
  email: string;
  displayName: string;
}

export interface SanitizedWorkspaceSettingsPayload {
  ownerUid: string;
  channelTemplates: ChannelTemplatesMap;
  providerConfig: ProviderConfig;
  updatedAt: string;
}

export interface SanitizedShortsQueuePayload {
  id: string;
  ownerUid: string;
  channelId: ShortsQueueItem['channelId'];
  title: string;
  bibleReference: string;
  durationSeconds: ShortsQueueItem['durationSeconds'];
  notes: string;
  stage: ShortsQueueItem['stage'];
  guardianStatus: ShortsQueueItem['guardianStatus'];
  updatedAt: string;
}

export interface SanitizedAgentTaskPayload {
  id: string;
  ownerUid: string;
  agentId: AgentId;
  prompt: string;
  output: string;
  error: string;
  status: TaskEntry['status'];
  createdAt: string;
  completedAt: string;
}

function clampString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function clampUnitNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(1, Math.max(0, num));
}

export function sanitizeUserProfilePayload(
  user: FirebaseAuthUserSummary
): SanitizedUserProfilePayload {
  const email = clampString(user.email ?? '', 254);
  const emailLocalPart = email.includes('@') ? email.split('@')[0] : '';
  const displayName = clampString(
    user.displayName?.trim() || emailLocalPart || 'Pemilik Studio',
    80
  );
  return {
    email,
    displayName: displayName || 'Pemilik Studio',
  };
}

export function sanitizeWorkspaceSettingsPayload(
  ownerUid: string,
  channelTemplates: ChannelTemplatesMap,
  providerConfig: ProviderConfig,
  nowIso = new Date().toISOString()
): SanitizedWorkspaceSettingsPayload {
  return {
    ownerUid: clampString(ownerUid, 128),
    channelTemplates,
    providerConfig: {
      llmRouting: providerConfig.llmRouting,
      ollama: {
        enabled: Boolean(providerConfig.ollama.enabled),
        baseUrl: clampString(providerConfig.ollama.baseUrl, 256),
        model: clampString(providerConfig.ollama.model, 120),
        connectionMode: providerConfig.ollama.connectionMode,
      },
      gemini: {
        textModel: providerConfig.gemini.textModel,
      },
      elevenlabs: {
        enabled: Boolean(providerConfig.elevenlabs.enabled),
        voiceId: clampString(providerConfig.elevenlabs.voiceId, 120),
        voiceName: clampString(providerConfig.elevenlabs.voiceName, 120),
        modelId: providerConfig.elevenlabs.modelId,
        stability: clampUnitNumber(providerConfig.elevenlabs.stability, 0.5),
        similarityBoost: clampUnitNumber(providerConfig.elevenlabs.similarityBoost, 0.75),
      },
    },
    updatedAt: clampString(nowIso, 64),
  };
}

export function sanitizeShortsQueueItemPayload(
  ownerUid: string,
  item: ShortsQueueItem,
  nowIso = new Date().toISOString()
): SanitizedShortsQueuePayload {
  return {
    id: clampString(item.id, 120),
    ownerUid: clampString(ownerUid, 128),
    channelId: item.channelId,
    title: clampString(item.title, 200),
    bibleReference: clampString(item.bibleReference ?? '', 160),
    durationSeconds: item.durationSeconds,
    notes: clampString(item.notes ?? '', 800),
    stage: item.stage,
    guardianStatus: item.guardianStatus,
    updatedAt: clampString(item.updatedAt || nowIso, 64),
  };
}

export function sanitizeAgentTaskPayload(
  ownerUid: string,
  entry: TaskEntry
): SanitizedAgentTaskPayload {
  return {
    id: clampString(entry.id, 120),
    ownerUid: clampString(ownerUid, 128),
    agentId: entry.agentId,
    prompt: clampString(entry.prompt, 2000),
    output: clampString(entry.output ?? '', 12000),
    error: clampString(entry.error ?? '', 500),
    status: entry.status,
    createdAt: clampString(entry.createdAt, 64),
    completedAt: clampString(entry.completedAt ?? '', 64),
  };
}

export function formatFirebaseAuthError(error: unknown, currentHost = ''): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');

  if (code === 'auth/unauthorized-domain' || rawMessage.includes('auth/unauthorized-domain')) {
    const hostNote = currentHost ? ` (${currentHost})` : '';
    return `Domain pratinjau${hostNote} belum terdaftar di Firebase Console. Tambahkan domain tersebut di Firebase Console → Authentication → Settings → Authorized domains.`;
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup login diblokir oleh browser. Izinkan popup untuk situs ini atau gunakan login Email & Kata Sandi.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Jendela login Google ditutup sebelum proses selesai. Silakan coba lagi.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Metode login ini belum diaktifkan di Firebase Console → Authentication → Sign-in method.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Email atau kata sandi tidak cocok dengan akun Firebase Anda.';
  }
  if (code === 'auth/invalid-email') {
    return 'Format alamat email tidak valid.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Email ini sudah terdaftar di Firebase Authentication. Silakan pilih tab Masuk.';
  }
  if (code === 'auth/weak-password') {
    return 'Kata sandi terlalu pendek. Gunakan minimal 6 karakter.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Gagal menghubungi server Firebase. Periksa koneksi internet Anda lalu coba lagi.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Terlalu banyak percobaan login. Tunggu sebentar lalu coba kembali.';
  }

  return rawMessage || 'Gagal melakukan autentikasi Firebase.';
}

export function isPermissionDeniedError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return (
    code === 'permission-denied' ||
    msg.toLowerCase().includes('missing or insufficient permissions') ||
    msg.toLowerCase().includes('permission-denied')
  );
}
