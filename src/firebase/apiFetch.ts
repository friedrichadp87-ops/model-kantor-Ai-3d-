import { auth, loadMasterBibleFromFirestore } from './client';
import { loadMasterBibleFromIndexedDb } from '../office/masterBibleStorage';
import { buildMasterBibleSystemPolicy } from '../office/masterBible';
import type { LocalBibleDatabase } from '../office/shortsFactory';

type JsonRequest = Record<string, unknown> & {
  masterBibleContext?: string;
  masterBibleVerses?: Array<{ ref: string; text: string }>;
  masterBibleActive?: boolean;
  masterBibleSourceName?: string;
};

let cachedUid: string | null = null;
let cachedBiblePromise: Promise<LocalBibleDatabase | null> | null = null;
let installed = false;

export function setApiMasterBibleCache(uid: string, database: LocalBibleDatabase): void {
  cachedUid = uid;
  cachedBiblePromise = Promise.resolve(database);
}

export function clearApiMasterBibleCache(): void {
  cachedUid = null;
  cachedBiblePromise = null;
}

async function getMasterBible(uid: string): Promise<LocalBibleDatabase | null> {
  if (cachedUid !== uid || !cachedBiblePromise) {
    cachedUid = uid;
    cachedBiblePromise = (async () => {
      try {
        const cloud = await loadMasterBibleFromFirestore(uid);
        if (cloud.ok && cloud.database) return cloud.database;
      } catch {
        // Offline fallback uses the last locally cached copy; Firestore stays authoritative
        // whenever it can be reached and contains the Master Bible.
      }
      return loadMasterBibleFromIndexedDb().catch(() => null);
    })();
  }
  return cachedBiblePromise;
}

/**
 * Adds the Firebase ID token to every same-origin protected /api request and
 * attaches only the Bible context needed by that request. Full Bible JSON never
 * leaves the browser; exact verses are resolved locally from the Firestore copy.
 */
export function installAuthenticatedApiFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let requestUrl: URL;
    try {
      const rawUrl = input instanceof Request ? input.url : String(input);
      requestUrl = new URL(rawUrl, window.location.origin);
    } catch {
      return originalFetch(input, init);
    }

    if (
      requestUrl.origin !== window.location.origin ||
      !requestUrl.pathname.startsWith('/api/') ||
      requestUrl.pathname === '/api/health' ||
      requestUrl.pathname === '/api/pwa/remote-version'
    ) {
      return originalFetch(input, init);
    }

    try {
      await auth.authStateReady();
    } catch {
      // The backend will reject the request if Firebase Auth cannot establish a session.
    }
    const user = auth.currentUser;
    if (!user) return originalFetch(input, init);

    const requestHeaders =
      input instanceof Request ? new Headers(input.headers) : new Headers();
    new Headers(init?.headers).forEach((value, key) => requestHeaders.set(key, value));

    try {
      const idToken = await user.getIdToken();
      requestHeaders.set('Authorization', `Bearer ${idToken}`);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Tidak dapat memperoleh token Firebase. Silakan masuk kembali.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const suppliedBody = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    let nextBody = suppliedBody;

    const shouldAttachBible =
      method !== 'GET' &&
      method !== 'HEAD' &&
      typeof suppliedBody === 'string' &&
      suppliedBody.length > 0 &&
      suppliedBody.length <= 1_000_000 &&
      requestHeaders.get('content-type')?.toLowerCase().includes('application/json') &&
      !requestUrl.pathname.startsWith('/api/studio/') &&
      !requestUrl.pathname.includes('/scene-keyframe') &&
      !requestUrl.pathname.includes('/scene-animate') &&
      !requestUrl.pathname.includes('/assemble-video');

    if (shouldAttachBible) {
      try {
        const body = JSON.parse(suppliedBody) as JsonRequest;
        const database = await getMasterBible(user.uid);
        const contextText = JSON.stringify(body).slice(0, 10_000);
        const policy = buildMasterBibleSystemPolicy(database, contextText);
        body.masterBibleContext = policy.policyBlock.slice(0, 35_000);
        body.masterBibleVerses = policy.matchedVerses.slice(0, 24);
        body.masterBibleActive = policy.masterActive;
        body.masterBibleSourceName = database?.report.sourceName ?? '';
        nextBody = JSON.stringify(body);
      } catch {
        // If the request body is not valid JSON, leave it unchanged; the API validates it.
      }
    }

    const nextInit: RequestInit = {
      ...init,
      headers: requestHeaders,
      ...(nextBody !== undefined ? { body: nextBody } : {}),
    };
    return originalFetch(input, nextInit);
  };
}
