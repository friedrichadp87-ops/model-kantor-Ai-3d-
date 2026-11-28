import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported, type Analytics } from 'firebase/analytics';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { mergeProviderConfig, type ProviderConfig } from '../office/providerConfig';
import {
  mergeChannelTemplates,
  type ChannelTemplatesMap,
  type LocalBibleDatabase,
  type ShortsQueueItem,
} from '../office/shortsFactory';
import type { TaskEntry } from '../office/types';
import {
  FIRESTORE_PATHS,
  chunkMasterBibleForFirestore,
  isPermissionDeniedError,
  reassembleMasterBibleFromFirestore,
  sanitizeAgentTaskPayload,
  sanitizeShortsQueueItemPayload,
  sanitizeUserProfilePayload,
  sanitizeWorkspaceSettingsPayload,
  type FirebaseAuthUserSummary,
  type SanitizedMasterBibleChunkPayload,
  type SanitizedMasterBibleMetaPayload,
  sanitizeWorkHistoryRecord,
  type WorkHistoryRecord,
} from './officeSync';

export const firebaseConfig = {
  apiKey: 'AIzaSyDhfi45DsuEskEHi8k69YNeWvJELvJen3Q',
  authDomain: 'kantor-ai-agent-creator.firebaseapp.com',
  projectId: 'kantor-ai-agent-creator',
  storageBucket: 'kantor-ai-agent-creator.firebasestorage.app',
  messagingSenderId: '435807483056',
  appId: '1:435807483056:web:6a1242c32de797ff107775',
  measurementId: 'G-XSH5N1KF8G',
} as const;

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

let analyticsInstance: Analytics | null = null;
if (typeof window !== 'undefined') {
  void isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        analyticsInstance = getAnalytics(firebaseApp);
      }
    })
    .catch(() => {
      // Analytics is optional in headless/privacy-restricted browsers
    });
}

export function getFirebaseAnalytics(): Analytics | null {
  return analyticsInstance;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export type FirestoreConnectionState = 'checking' | 'connected' | 'rules-locked' | 'offline';

export interface FirestoreSyncStatus {
  connection: FirestoreConnectionState;
  state: 'idle' | 'syncing' | 'synced' | 'permission-denied' | 'error';
  lastSyncedAt: string | null;
  message: string;
  blockedPath?: string | null;
}

export async function testFirestoreConnection(): Promise<{
  connection: FirestoreConnectionState;
  detail: string;
}> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return {
      connection: 'connected',
      detail: 'Tersambung langsung ke Cloud Firestore (kantor-ai-agent-creator).',
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return {
        connection: 'offline',
        detail: 'Klien Firestore sedang offline atau konfigurasi belum dapat dijangkau.',
      };
    }
    if (isPermissionDeniedError(error)) {
      return {
        connection: 'rules-locked',
        detail:
          'Server Firestore aktif & terjangkau (aturan rules membatasi akses sebelum login / belum membuka koleksi Kantor AI).',
      };
    }
    return {
      connection: 'connected',
      detail: 'Server Firebase terjangkau dan siap digunakan.',
    };
  }
}

export function toUserSummary(user: User | null): FirebaseAuthUserSummary | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    providerIds: user.providerData.map((p) => p.providerId).filter(Boolean),
  };
}

export function subscribeAuthUser(
  onChange: (user: FirebaseAuthUserSummary | null) => void
): Unsubscribe {
  return onAuthStateChanged(auth, (user) => {
    onChange(toUserSummary(user));
  });
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGooglePopup(): Promise<FirebaseAuthUserSummary> {
  const cred = await signInWithPopup(auth, googleProvider);
  const summary = toUserSummary(cred.user);
  if (!summary) {
    throw new Error('Akun Google tidak mengembalikan sesi pengguna.');
  }
  return summary;
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<FirebaseAuthUserSummary> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const summary = toUserSummary(cred.user);
  if (!summary) {
    throw new Error('Login tidak mengembalikan sesi pengguna.');
  }
  return summary;
}

export async function registerWithEmailPassword(
  email: string,
  password: string,
  displayName?: string
): Promise<FirebaseAuthUserSummary> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const cleanName = (displayName ?? '').trim().slice(0, 120);
  if (cleanName) {
    await updateProfile(cred.user, { displayName: cleanName });
  }
  const summary = toUserSummary(cred.user);
  if (!summary) {
    throw new Error('Pendaftaran akun tidak mengembalikan sesi pengguna.');
  }
  return {
    ...summary,
    displayName: cleanName || summary.displayName,
  };
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export interface SyncWriteResult {
  ok: boolean;
  permissionDenied?: boolean;
  path: string;
  errorMessage?: string;
}

async function safeWriteDoc(
  path: string,
  data: Record<string, unknown>
): Promise<SyncWriteResult> {
  try {
    const segments = path.split('/');
    await setDoc(doc(db, segments[0], ...segments.slice(1)), data, { merge: true });
    return { ok: true, path };
  } catch (error) {
    const errInfo = buildFirestoreErrorInfo(error, OperationType.WRITE, path);
    console.warn('Firestore Sync Notice:', JSON.stringify(errInfo));
    return {
      ok: false,
      permissionDenied: isPermissionDeniedError(error),
      path,
      errorMessage: errInfo.error,
    };
  }
}

export async function syncUserProfileToFirestore(
  user: FirebaseAuthUserSummary
): Promise<SyncWriteResult> {
  const path = FIRESTORE_PATHS.userDoc(user.uid);
  const payload = sanitizeUserProfilePayload(user);
  if (!payload.email) {
    return {
      ok: false,
      path,
      errorMessage: 'Akun tidak memiliki alamat email yang terverifikasi untuk dokumen profil.',
    };
  }
  try {
    const userRef = doc(db, 'users', user.uid);
    const existingSnap = await getDoc(userRef);
    if (existingSnap.exists()) {
      await updateDoc(userRef, {
        displayName: payload.displayName,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(userRef, {
        email: payload.email,
        displayName: payload.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return { ok: true, path };
  } catch (error) {
    const errInfo = buildFirestoreErrorInfo(error, OperationType.WRITE, path);
    console.warn('Firestore Profile Sync Notice:', JSON.stringify(errInfo));
    return {
      ok: false,
      permissionDenied: isPermissionDeniedError(error),
      path,
      errorMessage: errInfo.error,
    };
  }
}

export async function syncWorkspaceSettingsToFirestore(
  uid: string,
  channelTemplates: ChannelTemplatesMap,
  providerConfig: ProviderConfig
): Promise<SyncWriteResult> {
  const path = FIRESTORE_PATHS.workspaceSettingsDoc(uid);
  const payload = sanitizeWorkspaceSettingsPayload(uid, channelTemplates, providerConfig);
  return safeWriteDoc(path, payload as unknown as Record<string, unknown>);
}

export async function syncShortsQueueItemToFirestore(
  uid: string,
  item: ShortsQueueItem
): Promise<SyncWriteResult> {
  const path = FIRESTORE_PATHS.shortsQueueDoc(uid, item.id);
  const payload = sanitizeShortsQueueItemPayload(uid, item);
  return safeWriteDoc(path, payload as unknown as Record<string, unknown>);
}

export async function syncAgentTaskToFirestore(
  uid: string,
  entry: TaskEntry
): Promise<SyncWriteResult> {
  const path = FIRESTORE_PATHS.agentTaskDoc(uid, entry.id);
  const payload = sanitizeAgentTaskPayload(uid, entry);
  return safeWriteDoc(path, payload as unknown as Record<string, unknown>);
}

export function subscribeWorkspaceSettings(
  uid: string,
  onData: (data: {
    channelTemplates?: ChannelTemplatesMap;
    providerConfig?: ProviderConfig;
  }) => void,
  onError: (info: { permissionDenied: boolean; path: string; message: string }) => void
): Unsubscribe {
  const path = FIRESTORE_PATHS.workspaceSettingsDoc(uid);
  return onSnapshot(
    doc(db, 'users', uid, 'workspace', 'settings'),
    (snap) => {
      if (!snap.exists()) return;
      const raw = snap.data() as {
        channelTemplates?: unknown;
        providerConfig?: unknown;
      };
      onData({
        channelTemplates: raw.channelTemplates
          ? mergeChannelTemplates(raw.channelTemplates)
          : undefined,
        providerConfig: raw.providerConfig ? mergeProviderConfig(raw.providerConfig) : undefined,
      });
    },
    (error) => {
      const errInfo = buildFirestoreErrorInfo(error, OperationType.GET, path);
      console.warn('Firestore Workspace Subscription Notice:', JSON.stringify(errInfo));
      onError({
        permissionDenied: isPermissionDeniedError(error),
        path,
        message: errInfo.error,
      });
    }
  );
}

export function subscribeShortsQueue(
  uid: string,
  onItems: (items: ShortsQueueItem[]) => void,
  onError: (info: { permissionDenied: boolean; path: string; message: string }) => void
): Unsubscribe {
  const path = FIRESTORE_PATHS.shortsQueueCollection(uid);
  return onSnapshot(
    collection(db, 'users', uid, 'shortsQueue'),
    (snapshot) => {
      if (snapshot.empty) return;
      const items: ShortsQueueItem[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data() as Partial<ShortsQueueItem>;
        if (d.id && d.channelId && d.title && d.stage) {
          items.push({
            id: String(d.id),
            channelId: d.channelId,
            title: String(d.title),
            bibleReference: String(d.bibleReference ?? ''),
            durationSeconds:
              d.durationSeconds === 30 || d.durationSeconds === 60 ? d.durationSeconds : 45,
            notes: String(d.notes ?? ''),
            stage: d.stage,
            guardianStatus: d.guardianStatus ?? 'BELUM DICEK',
            updatedAt: String(d.updatedAt ?? new Date().toISOString()),
          });
        }
      });
      if (items.length > 0) {
        items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        onItems(items);
      }
    },
    (error) => {
      const errInfo = buildFirestoreErrorInfo(error, OperationType.LIST, path);
      console.warn('Firestore ShortsQueue Subscription Notice:', JSON.stringify(errInfo));
      onError({
        permissionDenied: isPermissionDeniedError(error),
        path,
        message: errInfo.error,
      });
    }
  );
}


export interface WorkHistoryWriteResult extends SyncWriteResult {}

export async function appendWorkHistoryToFirestore(
  uid: string,
  record: Omit<WorkHistoryRecord, 'ownerUid'>
): Promise<WorkHistoryWriteResult> {
  const payload = sanitizeWorkHistoryRecord(uid, record);
  const path = `users/${uid}/workHistory/${payload.id}`;
  try {
    // Immutable event document: each start/completion/error is a separate append-only record.
    await setDoc(doc(db, 'users', uid, 'workHistory', payload.id), payload);
    return { ok: true, path };
  } catch (error) {
    const info = buildFirestoreErrorInfo(error, OperationType.WRITE, path);
    console.warn('Firestore Work History Write Notice:', JSON.stringify(info));
    return {
      ok: false,
      permissionDenied: isPermissionDeniedError(error),
      path,
      errorMessage: info.error,
    };
  }
}

export function subscribeWorkHistory(
  uid: string,
  onRecords: (records: WorkHistoryRecord[]) => void,
  onError: (info: { permissionDenied: boolean; path: string; message: string }) => void
): Unsubscribe {
  const path = `users/${uid}/workHistory`;
  const historyQuery = query(
    collection(db, 'users', uid, 'workHistory'),
    orderBy('createdAt', 'desc'),
    limit(200)
  );
  return onSnapshot(
    historyQuery,
    (snapshot) => {
      const records = snapshot.docs.map((item) => ({
        ...(item.data() as WorkHistoryRecord),
        id: item.id,
      }));
      onRecords(records);
    },
    (error) => {
      const info = buildFirestoreErrorInfo(error, OperationType.LIST, path);
      console.warn('Firestore Work History Subscription Notice:', JSON.stringify(info));
      onError({
        permissionDenied: isPermissionDeniedError(error),
        path,
        message: info.error,
      });
    }
  );
}

export interface MasterBibleFirestoreLoadResult {
  ok: boolean;
  database: LocalBibleDatabase | null;
  permissionDenied?: boolean;
  path: string;
  errorMessage?: string;
}

/**
 * Persists the full Master Alkitab Terjemahan Baru into Cloud Firestore under:
 *   users/{uid}/masterBible/meta
 *   users/{uid}/masterBibleChunks/chunk_000 .. chunk_NNN (each <= 400 KB)
 */
export async function syncMasterBibleToFirestore(
  uid: string,
  database: LocalBibleDatabase
): Promise<SyncWriteResult & { chunkCount?: number }> {
  const metaPath = FIRESTORE_PATHS.masterBibleMetaDoc(uid);
  const chunksColPath = FIRESTORE_PATHS.masterBibleChunksCollection(uid);
  const chunked = chunkMasterBibleForFirestore(uid, database);
  const uploadId = `bible_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const versionedChunks = chunked.chunks.map(({ chunkId, payload }) => ({
    documentId: `${uploadId}_${chunkId}`,
    payload: { ...payload, uploadId },
  }));

  try {
    // Write versioned chunks first. The currently published metadata still points
    // to the previous complete upload while a replacement is being prepared.
    const batchConcurrency = 4;
    for (let i = 0; i < versionedChunks.length; i += batchConcurrency) {
      const slice = versionedChunks.slice(i, i + batchConcurrency);
      await Promise.all(
        slice.map(({ documentId, payload }) =>
          setDoc(doc(db, 'users', uid, 'masterBibleChunks', documentId), payload)
        )
      );
    }

    // Atomically publish the new version only after every chunk has been written.
    await setDoc(doc(db, 'users', uid, 'masterBible', 'meta'), {
      ...chunked.meta,
      uploadId,
    });

    // Old versions are no longer referenced. Clean them up after publication;
    // cleanup failure is harmless because readers filter by the active uploadId.
    try {
      const existingChunksSnap = await getDocs(collection(db, 'users', uid, 'masterBibleChunks'));
      const orphanCutoff = Date.now() - 24 * 60 * 60 * 1000;
      const staleDocs = existingChunksSnap.docs.filter((item) => {
        const data = item.data();
        if (data.uploadId === uploadId) return false;
        const updatedAt = Date.parse(String(data.updatedAt ?? ''));
        // Keep recent versions because another device may still be uploading them.
        return Number.isFinite(updatedAt) && updatedAt < orphanCutoff;
      });
      if (staleDocs.length > 0) {
        await Promise.all(staleDocs.map((item) => deleteDoc(item.ref)));
      }
    } catch (cleanupError) {
      console.warn('Firestore Master Bible old-version cleanup deferred:', cleanupError);
    }

    return {
      ok: true,
      path: metaPath,
      chunkCount: chunked.chunks.length,
    };
  } catch (error) {
    const failedPath =
      error instanceof Error && error.message.includes('masterBibleChunks')
        ? chunksColPath
        : metaPath;
    const errInfo = buildFirestoreErrorInfo(error, OperationType.WRITE, failedPath);
    console.warn('Firestore Master Bible Sync Notice:', JSON.stringify(errInfo));
    return {
      ok: false,
      permissionDenied: isPermissionDeniedError(error),
      path: failedPath,
      errorMessage: errInfo.error,
    };
  }
}

export async function loadMasterBibleFromFirestore(
  uid: string
): Promise<MasterBibleFirestoreLoadResult> {
  const metaPath = FIRESTORE_PATHS.masterBibleMetaDoc(uid);
  try {
    const metaSnap = await getDoc(doc(db, 'users', uid, 'masterBible', 'meta'));
    if (!metaSnap.exists()) {
      return { ok: true, database: null, path: metaPath };
    }
    const metaData = metaSnap.data() as Partial<SanitizedMasterBibleMetaPayload>;
    const chunksSnap = await getDocs(collection(db, 'users', uid, 'masterBibleChunks'));
    const chunks: Array<Partial<SanitizedMasterBibleChunkPayload>> = [];
    chunksSnap.forEach((snap) => {
      const chunk = snap.data() as Partial<SanitizedMasterBibleChunkPayload>;
      // New uploads are versioned. Keep support for legacy unversioned chunks until
      // a new Master Bible is saved once from the Settings screen.
      if (metaData.uploadId ? chunk.uploadId === metaData.uploadId : !chunk.uploadId) {
        chunks.push(chunk);
      }
    });

    const database = reassembleMasterBibleFromFirestore(metaData, chunks);
    return {
      ok: true,
      database,
      path: metaPath,
    };
  } catch (error) {
    const errInfo = buildFirestoreErrorInfo(error, OperationType.GET, metaPath);
    console.warn('Firestore Master Bible Load Notice:', JSON.stringify(errInfo));
    return {
      ok: false,
      database: null,
      permissionDenied: isPermissionDeniedError(error),
      path: metaPath,
      errorMessage: errInfo.error,
    };
  }
}

export function subscribeMasterBible(
  uid: string,
  onDatabase: (database: LocalBibleDatabase | null) => void,
  onError: (info: { permissionDenied: boolean; path: string; message: string }) => void
): Unsubscribe {
  const path = FIRESTORE_PATHS.masterBibleMetaDoc(uid);
  return onSnapshot(
    doc(db, 'users', uid, 'masterBible', 'meta'),
    async (metaSnapshot) => {
      if (!metaSnapshot.exists()) {
        onDatabase(null);
        return;
      }
      try {
        const result = await loadMasterBibleFromFirestore(uid);
        if (result.ok) onDatabase(result.database);
        else {
          onError({
            permissionDenied: Boolean(result.permissionDenied),
            path: result.path,
            message: result.errorMessage ?? 'Master Alkitab Firestore gagal dimuat.',
          });
        }
      } catch (error) {
        const info = buildFirestoreErrorInfo(error, OperationType.GET, path);
        onError({
          permissionDenied: isPermissionDeniedError(error),
          path,
          message: info.error,
        });
      }
    },
    (error) => {
      const info = buildFirestoreErrorInfo(error, OperationType.GET, path);
      console.warn('Firestore Master Bible Subscription Notice:', JSON.stringify(info));
      onError({
        permissionDenied: isPermissionDeniedError(error),
        path,
        message: info.error,
      });
    }
  );
}

export async function deleteMasterBibleFromFirestore(uid: string): Promise<SyncWriteResult> {
  const metaPath = FIRESTORE_PATHS.masterBibleMetaDoc(uid);
  try {
    const chunksSnap = await getDocs(collection(db, 'users', uid, 'masterBibleChunks'));
    await Promise.all(chunksSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(db, 'users', uid, 'masterBible', 'meta'));
    return { ok: true, path: metaPath };
  } catch (error) {
    const errInfo = buildFirestoreErrorInfo(error, OperationType.DELETE, metaPath);
    console.warn('Firestore Master Bible Delete Notice:', JSON.stringify(errInfo));
    return {
      ok: false,
      permissionDenied: isPermissionDeniedError(error),
      path: metaPath,
      errorMessage: errInfo.error,
    };
  }
}
