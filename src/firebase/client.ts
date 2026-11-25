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
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { mergeProviderConfig, type ProviderConfig } from '../office/providerConfig';
import {
  mergeChannelTemplates,
  type ChannelTemplatesMap,
  type ShortsQueueItem,
} from '../office/shortsFactory';
import type { TaskEntry } from '../office/types';
import {
  FIRESTORE_PATHS,
  isPermissionDeniedError,
  sanitizeAgentTaskPayload,
  sanitizeShortsQueueItemPayload,
  sanitizeUserProfilePayload,
  sanitizeWorkspaceSettingsPayload,
  type FirebaseAuthUserSummary,
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
