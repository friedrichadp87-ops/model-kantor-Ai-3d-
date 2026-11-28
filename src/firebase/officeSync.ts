import type { ProviderConfig } from '../office/providerConfig';
import type {
  ChannelTemplatesMap,
  LocalBibleDatabase,
  ShortsChannelId,
  ShortsQueueItem,
} from '../office/shortsFactory';
import type { AgentId, TaskEntry } from '../office/types';

export const FIREBASE_PROJECT_ID = 'kantor-ai-agent-creator';

export const MASTER_BIBLE_CHUNK_MAX_BYTES = 400_000;
export const MASTER_BIBLE_CHUNK_MAX_VERSES = 2500;

export function formatMasterBibleChunkId(chunkIndex: number): string {
  return `chunk_${String(Math.max(0, Math.floor(chunkIndex))).padStart(3, '0')}`;
}

export const FIRESTORE_PATHS = {
  userDoc: (uid: string) => `users/${uid}`,
  workspaceSettingsDoc: (uid: string) => `users/${uid}/workspace/settings`,
  shortsQueueCollection: (uid: string) => `users/${uid}/shortsQueue`,
  shortsQueueDoc: (uid: string, itemId: string) => `users/${uid}/shortsQueue/${itemId}`,
  agentTasksCollection: (uid: string) => `users/${uid}/agentTasks`,
  workHistoryCollection: (uid: string) => `users/${uid}/workHistory`,
  agentTaskDoc: (uid: string, taskId: string) => `users/${uid}/agentTasks/${taskId}`,
  masterBibleMetaDoc: (uid: string) => `users/${uid}/masterBible/meta`,
  masterBibleChunksCollection: (uid: string) => `users/${uid}/masterBibleChunks`,
  masterBibleChunkDoc: (uid: string, chunkIndex: number) =>
    `users/${uid}/masterBibleChunks/${formatMasterBibleChunkId(chunkIndex)}`,
} as const;

export const MASTER_BIBLE_FIRESTORE_RULES_SNIPPET = `match /users/{userId}/masterBible/{docId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
match /users/{userId}/masterBibleChunks/{chunkId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}`;

export interface WorkHistoryRecord {
  id: string;
  ownerUid: string;
  floorId: 1 | 2 | 3;
  floorName: string;
  channelId: ShortsChannelId;
  channelName: string;
  projectId: string;
  runId: string;
  taskId: string;
  agentId: AgentId | string;
  agentName: string;
  stageId: string;
  stageTitle: string;
  eventType: string;
  phase: 'start' | 'completed' | 'error' | 'warning';
  title: string;
  input: string;
  output: string;
  error: string;
  detail: string;
  provider: string;
  model: string;
  masterBibleActive: boolean;
  masterBibleSourceName: string;
  createdAt: string;
  completedAt: string;
}

export function sanitizeWorkHistoryRecord(
  ownerUid: string,
  input: Omit<WorkHistoryRecord, 'ownerUid'>
): WorkHistoryRecord {
  const floorId = input.floorId === 2 || input.floorId === 3 ? input.floorId : 1;
  const channelId: ShortsChannelId =
    input.channelId === 'bible-stories-3d' ||
    input.channelId === 'bible-facts-mysteries'
      ? input.channelId
      : 'daily-faith-inspiration';
  const phase =
    input.phase === 'completed' || input.phase === 'error' || input.phase === 'warning'
      ? input.phase
      : 'start';
  return {
    id: clampString(input.id, 140),
    ownerUid: clampString(ownerUid, 128),
    floorId,
    floorName: clampString(input.floorName, 100),
    channelId,
    channelName: clampString(input.channelName, 120),
    projectId: clampString(input.projectId, 140),
    runId: clampString(input.runId, 140),
    taskId: clampString(input.taskId, 140),
    agentId: clampString(String(input.agentId ?? ''), 80),
    agentName: clampString(input.agentName, 120),
    stageId: clampString(input.stageId, 100),
    stageTitle: clampString(input.stageTitle, 180),
    eventType: clampString(input.eventType, 100),
    phase,
    title: clampString(input.title, 240),
    input: clampString(input.input, 10_000),
    output: clampString(input.output, 18_000),
    error: clampString(input.error, 4_000),
    detail: clampString(input.detail, 4_000),
    provider: clampString(input.provider, 80),
    model: clampString(input.model, 120),
    masterBibleActive: Boolean(input.masterBibleActive),
    masterBibleSourceName: clampString(input.masterBibleSourceName, 200),
    createdAt: clampString(input.createdAt, 64),
    completedAt: clampString(input.completedAt, 64),
  };
}

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

export interface SanitizedMasterBibleMetaPayload {
  ownerUid: string;
  uploadId?: string;
  sourceName: string;
  publisher: string;
  year: string;
  copyrightStatement: string;
  indexedVerseCount: number;
  bookCount: number;
  chapterCount: number;
  missingBookCount: number;
  chunkCount: number;
  updatedAt: string;
}

export interface SanitizedMasterBibleChunkPayload {
  ownerUid: string;
  uploadId?: string;
  chunkIndex: number;
  chunkCount: number;
  verseCount: number;
  verses: Record<string, string>;
  updatedAt: string;
}

export function selectMasterBibleChunksForUpload(
  meta: Partial<SanitizedMasterBibleMetaPayload> | null | undefined,
  chunks: Array<Partial<SanitizedMasterBibleChunkPayload>>
): Array<Partial<SanitizedMasterBibleChunkPayload>> {
  if (meta?.uploadId) {
    return chunks.filter((chunk) => chunk.uploadId === meta.uploadId);
  }
  // Backward compatibility for existing unversioned chunks uploaded by older builds.
  return chunks.filter((chunk) => !chunk.uploadId);
}

export interface ChunkedMasterBiblePayload {
  meta: SanitizedMasterBibleMetaPayload;
  chunks: Array<{
    chunkId: string;
    payload: SanitizedMasterBibleChunkPayload;
  }>;
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
      voiceProvider: providerConfig.voiceProvider,
      edgeTts: {
        workerUrl: clampString(providerConfig.edgeTts.workerUrl, 512),
        voice: providerConfig.edgeTts.voice,
        rate: clampString(providerConfig.edgeTts.rate, 8),
        pitch: clampString(providerConfig.edgeTts.pitch, 8),
      },
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

function estimateUtf8Bytes(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return text.length * 2;
}

/**
 * Splits a full Terjemahan Baru LocalBibleDatabase (~31,102 verses / ~4.5 MB) into
 * deterministic, byte-bounded Firestore chunk documents (<= 400 KB each, safely under
 * Firestore's 1 MiB per-document limit) plus a single metadata document.
 */
export function chunkMasterBibleForFirestore(
  ownerUid: string,
  db: LocalBibleDatabase,
  options?: {
    maxBytesPerChunk?: number;
    maxVersesPerChunk?: number;
    nowIso?: string;
  }
): ChunkedMasterBiblePayload {
  const safeUid = clampString(ownerUid, 128);
  const nowIso = clampString(options?.nowIso ?? new Date().toISOString(), 64);
  const maxBytes = Math.max(8_192, options?.maxBytesPerChunk ?? MASTER_BIBLE_CHUNK_MAX_BYTES);
  const maxVerses = Math.max(50, options?.maxVersesPerChunk ?? MASTER_BIBLE_CHUNK_MAX_VERSES);

  const entries = Object.entries(db.versesMap).sort(([a], [b]) => a.localeCompare(b));
  const rawChunks: Array<Record<string, string>> = [];
  let currentMap: Record<string, string> = {};
  let currentBytes = 256;
  let currentCount = 0;

  for (const [key, value] of entries) {
    const cleanKey = clampString(key, 64);
    const cleanVal = clampString(value, 4000);
    if (!cleanKey || !cleanVal) continue;
    const entryBytes = estimateUtf8Bytes(cleanKey) + estimateUtf8Bytes(cleanVal) + 16;

    if (
      currentCount > 0 &&
      (currentBytes + entryBytes > maxBytes || currentCount >= maxVerses)
    ) {
      rawChunks.push(currentMap);
      currentMap = {};
      currentBytes = 256;
      currentCount = 0;
    }

    currentMap[cleanKey] = cleanVal;
    currentBytes += entryBytes;
    currentCount += 1;
  }

  if (currentCount > 0) {
    rawChunks.push(currentMap);
  }

  const chunkCount = rawChunks.length;
  const chunks = rawChunks.map((verses, chunkIndex) => ({
    chunkId: formatMasterBibleChunkId(chunkIndex),
    payload: {
      ownerUid: safeUid,
      chunkIndex,
      chunkCount,
      verseCount: Object.keys(verses).length,
      verses,
      updatedAt: nowIso,
    },
  }));

  const indexedVerseCount = chunks.reduce((sum, item) => sum + item.payload.verseCount, 0);

  return {
    meta: {
      ownerUid: safeUid,
      sourceName: clampString(db.report.sourceName || 'Alkitab Terjemahan Baru (TB)', 200),
      publisher: clampString(
        db.report.publisher || 'Lembaga Alkitab Indonesia (LAI) — Unggahan Pemilik Studio',
        200
      ),
      year: clampString(db.report.year || 'TB', 40),
      copyrightStatement: clampString(
        db.report.copyrightStatement ||
          'Sumber utama internal Kantor AI 3D (Lantai 1, 2 & 3) untuk verifikasi teks Alkitab lokal.',
        500
      ),
      indexedVerseCount,
      bookCount: Math.max(0, Math.floor(Number(db.report.bookCount) || 0)),
      chapterCount: Math.max(0, Math.floor(Number(db.report.chapterCount) || 0)),
      missingBookCount: Math.max(0, Math.floor(Number(db.report.missingBookCount) || 0)),
      chunkCount,
      updatedAt: nowIso,
    },
    chunks,
  };
}

export function reassembleMasterBibleFromFirestore(
  meta: Partial<SanitizedMasterBibleMetaPayload> | null | undefined,
  chunks: Array<Partial<SanitizedMasterBibleChunkPayload>>
): LocalBibleDatabase | null {
  if (!meta || !Array.isArray(chunks) || chunks.length === 0) {
    return null;
  }

  const ordered = [...chunks].sort(
    (a, b) => Number(a.chunkIndex ?? 0) - Number(b.chunkIndex ?? 0)
  );
  const versesMap: Record<string, string> = {};
  for (const chunk of ordered) {
    if (!chunk.verses || typeof chunk.verses !== 'object') continue;
    for (const [k, v] of Object.entries(chunk.verses)) {
      if (typeof v === 'string' && v.trim()) {
        versesMap[k] = v;
      }
    }
  }

  const indexedVerseCount = Object.keys(versesMap).length;
  if (indexedVerseCount === 0) {
    return null;
  }

  return {
    versesMap,
    report: {
      indexedVerseCount,
      bookCount: Math.max(0, Math.floor(Number(meta.bookCount) || 0)),
      chapterCount: Math.max(0, Math.floor(Number(meta.chapterCount) || 0)),
      missingBookCount: Math.max(0, Math.floor(Number(meta.missingBookCount) || 0)),
      sourceName: String(meta.sourceName || 'Alkitab Terjemahan Baru (Firebase Cloud)'),
      publisher: String(
        meta.publisher || 'Lembaga Alkitab Indonesia (LAI) — Tersimpan di Firebase Firestore'
      ),
      year: String(meta.year || 'TB'),
      copyrightStatement: String(
        meta.copyrightStatement ||
          'Sumber utama internal Kantor AI 3D (Lantai 1, 2 & 3) yang tersinkron di Cloud Firestore.'
      ),
    },
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
