import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const YOUTUBE_CHANNEL_IDS = [
  'daily-faith-inspiration',
  'bible-stories-3d',
  'bible-facts-mysteries',
] as const;

export type YoutubeChannelId = (typeof YOUTUBE_CHANNEL_IDS)[number];
export type YoutubePrivacyStatus = 'private' | 'unlisted' | 'public';

export interface YoutubeOAuthState {
  version: 1;
  uid: string;
  channelId: YoutubeChannelId;
  issuedAt: number;
  nonce: string;
}

export interface YoutubeOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
  encryptionKey: Buffer;
  projectId: string;
}

export interface YoutubeConnectionDocument extends Record<string, unknown> {
  ownerUid: string;
  channelId: YoutubeChannelId;
  status: 'connected';
  googleEmail: string;
  googleDisplayName: string;
  encryptedRefreshToken: string;
  connectedAt: string;
  updatedAt: string;
  autoUploadEnabled: boolean;
  privacyStatus: YoutubePrivacyStatus;
  targetChannelLabel: string;
}

export class YoutubeOAuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'YoutubeOAuthError';
    this.statusCode = statusCode;
  }
}

export function isYoutubeChannelId(value: unknown): value is YoutubeChannelId {
  return typeof value === 'string' && (YOUTUBE_CHANNEL_IDS as readonly string[]).includes(value);
}

export function isYoutubePrivacyStatus(value: unknown): value is YoutubePrivacyStatus {
  return value === 'private' || value === 'unlisted' || value === 'public';
}

export function getYoutubeOAuthConfig(): YoutubeOAuthConfig {
  const clientId = (process.env.YOUTUBE_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.YOUTUBE_CLIENT_SECRET ?? '').trim();
  const redirectUri = (process.env.YOUTUBE_REDIRECT_URI ?? '').trim();
  const stateSecret = (process.env.YOUTUBE_OAUTH_STATE_SECRET ?? '').trim();
  const encryptionHex = (process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY ?? '').trim();
  const projectId = (process.env.FIREBASE_PROJECT_ID ?? 'kantor-ai-agent-creator').trim();

  if (!clientId || !clientSecret || !redirectUri || !stateSecret) {
    throw new YoutubeOAuthError(
      'Integrasi YouTube belum lengkap. Atur YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI, dan YOUTUBE_OAUTH_STATE_SECRET di Netlify.',
      503
    );
  }

  let parsedRedirect: URL;
  try {
    parsedRedirect = new URL(redirectUri);
  } catch {
    throw new YoutubeOAuthError('YOUTUBE_REDIRECT_URI harus berupa URL absolut yang valid.', 503);
  }
  if (
    parsedRedirect.protocol !== 'https:' &&
    parsedRedirect.hostname !== 'localhost' &&
    parsedRedirect.hostname !== '127.0.0.1'
  ) {
    throw new YoutubeOAuthError('YOUTUBE_REDIRECT_URI produksi harus menggunakan HTTPS.', 503);
  }
  if (stateSecret.length < 32) {
    throw new YoutubeOAuthError('YOUTUBE_OAUTH_STATE_SECRET minimal 32 karakter acak.', 503);
  }
  if (!/^[a-f0-9]{64}$/i.test(encryptionHex)) {
    throw new YoutubeOAuthError(
      'YOUTUBE_TOKEN_ENCRYPTION_KEY harus berisi 64 karakter heksadesimal (32 byte).',
      503
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    stateSecret,
    encryptionKey: Buffer.from(encryptionHex, 'hex'),
    projectId,
  };
}

export function isYoutubeOAuthConfigured(): boolean {
  try {
    getYoutubeOAuthConfig();
    return true;
  } catch {
    return false;
  }
}

export function createYoutubeOAuthState(
  uid: string,
  channelId: YoutubeChannelId,
  secret: string,
  now = Date.now()
): string {
  if (!uid || uid.length > 128 || secret.length < 32) {
    throw new Error('Firebase UID or OAuth state secret is invalid.');
  }
  const state: YoutubeOAuthState = {
    version: 1,
    uid,
    channelId,
    issuedAt: now,
    nonce: randomBytes(18).toString('base64url'),
  };
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyYoutubeOAuthState(
  state: string,
  secret: string,
  now = Date.now()
): YoutubeOAuthState {
  if (typeof state !== 'string' || state.length > 4096 || secret.length < 32) {
    throw new YoutubeOAuthError('State OAuth YouTube tidak valid atau telah kedaluwarsa.', 400);
  }
  const [payload, suppliedSignature, extra] = state.split('.');
  if (!payload || !suppliedSignature || extra !== undefined) {
    throw new YoutubeOAuthError('State OAuth YouTube tidak valid.', 400);
  }

  const expectedSignature = createHmac('sha256', secret).update(payload).digest();
  let receivedSignature: Buffer;
  try {
    receivedSignature = Buffer.from(suppliedSignature, 'base64url');
  } catch {
    throw new YoutubeOAuthError('Tanda tangan state OAuth tidak valid.', 400);
  }
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    throw new YoutubeOAuthError('Tanda tangan state OAuth tidak cocok.', 400);
  }

  let parsed: YoutubeOAuthState;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as YoutubeOAuthState;
  } catch {
    throw new YoutubeOAuthError('Isi state OAuth tidak dapat dibaca.', 400);
  }

  if (
    parsed.version !== 1 ||
    typeof parsed.uid !== 'string' ||
    parsed.uid.length === 0 ||
    parsed.uid.length > 128 ||
    !isYoutubeChannelId(parsed.channelId) ||
    typeof parsed.issuedAt !== 'number' ||
    !Number.isFinite(parsed.issuedAt) ||
    parsed.issuedAt > now + 60_000 ||
    now - parsed.issuedAt > 10 * 60_000 ||
    typeof parsed.nonce !== 'string' ||
    parsed.nonce.length < 16
  ) {
    throw new YoutubeOAuthError('State OAuth YouTube telah kedaluwarsa atau tidak valid.', 400);
  }
  return parsed;
}

export function encryptYoutubeRefreshToken(token: string, key: Buffer): string {
  if (!token || key.length !== 32) throw new Error('Invalid refresh token encryption input.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptYoutubeRefreshToken(value: string, key: Buffer): string {
  if (key.length !== 32) throw new Error('Invalid refresh token encryption key.');
  const [version, ivValue, tagValue, ciphertextValue, extra] = value.split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !ciphertextValue || extra !== undefined) {
    throw new Error('Stored YouTube refresh token has an unsupported format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

type FirestoreValue = Record<string, unknown>;

function encodeFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: 'NULL_VALUE' };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isFinite(value)) return { doubleValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  }
  if (typeof value === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      fields[key] = encodeFirestoreValue(item);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function decodeFirestoreValue(value: FirestoreValue): unknown {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    const values = (value.arrayValue as { values?: FirestoreValue[] } | undefined)?.values ?? [];
    return values.map(decodeFirestoreValue);
  }
  if ('mapValue' in value) {
    const nested = (value.mapValue as { fields?: Record<string, FirestoreValue> } | undefined)?.fields ?? {};
    return Object.fromEntries(Object.entries(nested).map(([key, item]) => [key, decodeFirestoreValue(item)]));
  }
  return undefined;
}

function decodeFirestoreDocument(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const fields = (raw as { fields?: Record<string, FirestoreValue> }).fields;
  if (!fields) return {};
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)])
  );
}

function firestoreDocumentUrl(projectId: string, uid: string, collection: string, documentId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(uid)}/${collection}/${encodeURIComponent(documentId)}`;
}

async function firestoreRequest(
  url: string,
  firebaseIdToken: string,
  init: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${firebaseIdToken}`,
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(12_000),
  });
}

export async function readYoutubeFirestoreDocument(
  uid: string,
  collection: 'youtubeConnections' | 'youtubeUploads',
  documentId: string,
  firebaseIdToken: string,
  projectId = (process.env.FIREBASE_PROJECT_ID ?? 'kantor-ai-agent-creator').trim()
): Promise<Record<string, unknown> | null> {
  const response = await firestoreRequest(
    firestoreDocumentUrl(projectId, uid, collection, documentId),
    firebaseIdToken,
    { method: 'GET' }
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.text();
    throw new YoutubeOAuthError(
      `Firestore menolak pembacaan data YouTube (HTTP ${response.status}): ${detail.slice(0, 240)}`,
      response.status === 401 || response.status === 403 ? 403 : 502
    );
  }
  return decodeFirestoreDocument(await response.json());
}

export async function writeYoutubeFirestoreDocument(
  uid: string,
  collection: 'youtubeConnections' | 'youtubeUploads',
  documentId: string,
  data: Record<string, unknown>,
  firebaseIdToken: string,
  projectId = (process.env.FIREBASE_PROJECT_ID ?? 'kantor-ai-agent-creator').trim()
): Promise<void> {
  const fields = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, encodeFirestoreValue(value)])
  );
  const response = await firestoreRequest(
    firestoreDocumentUrl(projectId, uid, collection, documentId),
    firebaseIdToken,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new YoutubeOAuthError(
      `Firestore gagal menyimpan pengaturan YouTube (HTTP ${response.status}): ${detail.slice(0, 240)}`,
      response.status === 401 || response.status === 403 ? 403 : 502
    );
  }
}

export async function deleteYoutubeFirestoreDocument(
  uid: string,
  collection: 'youtubeConnections' | 'youtubeUploads',
  documentId: string,
  firebaseIdToken: string,
  projectId = (process.env.FIREBASE_PROJECT_ID ?? 'kantor-ai-agent-creator').trim()
): Promise<void> {
  const response = await firestoreRequest(
    firestoreDocumentUrl(projectId, uid, collection, documentId),
    firebaseIdToken,
    { method: 'DELETE' }
  );
  if (!response.ok && response.status !== 404) {
    const detail = await response.text();
    throw new YoutubeOAuthError(
      `Firestore gagal menghapus koneksi YouTube (HTTP ${response.status}): ${detail.slice(0, 240)}`,
      response.status === 401 || response.status === 403 ? 403 : 502
    );
  }
}

export function getFirebaseBearerToken(authorizationHeader: string | undefined): string {
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader ?? '');
  if (!match) throw new YoutubeOAuthError('Sesi Firebase diperlukan untuk koneksi YouTube.', 401);
  return match[1].trim();
}

export function sanitizeYoutubeConnection(
  channelId: YoutubeChannelId,
  document: Record<string, unknown> | null
): Record<string, unknown> {
  if (!document || document.status !== 'connected') {
    return {
      channelId,
      connected: false,
      autoUploadEnabled: false,
      privacyStatus: 'private',
      targetChannelLabel: '',
      googleEmail: '',
      googleDisplayName: '',
    };
  }
  return {
    channelId,
    connected: true,
    autoUploadEnabled: document.autoUploadEnabled === true,
    privacyStatus: isYoutubePrivacyStatus(document.privacyStatus) ? document.privacyStatus : 'private',
    targetChannelLabel: typeof document.targetChannelLabel === 'string' ? document.targetChannelLabel : '',
    googleEmail: typeof document.googleEmail === 'string' ? document.googleEmail : '',
    googleDisplayName: typeof document.googleDisplayName === 'string' ? document.googleDisplayName : '',
    connectedAt: typeof document.connectedAt === 'string' ? document.connectedAt : '',
    lastUploadAt: typeof document.lastUploadAt === 'string' ? document.lastUploadAt : '',
  };
}
