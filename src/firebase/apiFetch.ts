import { appendWorkHistoryToFirestore, auth, loadMasterBibleFromFirestore } from './client';
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

let activeApiWorkContext: {
  runId: string;
  channelId: 'daily-faith-inspiration' | 'bible-stories-3d' | 'bible-facts-mysteries';
} | null = null;

export function setActiveApiWorkContext(
  runId: string,
  channelId: 'daily-faith-inspiration' | 'bible-stories-3d' | 'bible-facts-mysteries'
): void {
  activeApiWorkContext = { runId, channelId };
}

export function clearActiveApiWorkContext(runId?: string): void {
  if (!runId || activeApiWorkContext?.runId === runId) activeApiWorkContext = null;
}


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
        // Firestore is authoritative: a successful "no Master Bible uploaded" response
        // must not resurrect an obsolete IndexedDB copy from another upload/version.
        if (cloud.ok) return cloud.database;
        if (cloud.permissionDenied) {
          // A permission error is not an offline condition. Do not let an old local
          // edition silently replace the owner's central Firestore source.
          return null;
        }
      } catch {
        // Only a network/runtime failure reaches the offline fallback below.
      }
      return loadMasterBibleFromIndexedDb().catch(() => null);
    })();
  }
  return cachedBiblePromise;
}


type AuditFloorId = 1 | 2 | 3;

function inferAuditFloor(pathname: string, body: Record<string, unknown>): AuditFloorId | null {
  const floor = Number(body.floorId);
  if (floor === 1 || floor === 2 || floor === 3) return floor;

  const channelId = body.channelId;
  if (channelId === 'daily-faith-inspiration') return 1;
  if (channelId === 'bible-stories-3d') return 2;
  if (channelId === 'bible-facts-mysteries') return 3;

  if (pathname.includes('/devotional/')) return 1;
  if (pathname.includes('/bible-stories/')) return 2;
  if (pathname.includes('/bible-facts/')) return 3;
  if (activeApiWorkContext?.channelId === 'daily-faith-inspiration') return 1;
  if (activeApiWorkContext?.channelId === 'bible-stories-3d') return 2;
  if (activeApiWorkContext?.channelId === 'bible-facts-mysteries') return 3;
  return null;
}

function auditSafeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[nested data omitted]';
  if (typeof value === 'string') return value.slice(0, 3500);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 15).map((item) => auditSafeValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/(masterBible|dataUrl|base64|credential|apiKey|secret|token|audioData|videoData|imageData)/i.test(key)) {
        continue;
      }
      result[key] = auditSafeValue(item, depth + 1);
    }
    return result;
  }
  return String(value).slice(0, 500);
}

function safeAuditJson(value: unknown, maxLength = 16_000): string {
  try {
    return JSON.stringify(auditSafeValue(value)).slice(0, maxLength);
  } catch {
    return '[response could not be serialized]';
  }
}

function appendApiAuditEvent(
  uid: string,
  base: {
    id: string;
    floorId: AuditFloorId;
    channelId: 'daily-faith-inspiration' | 'bible-stories-3d' | 'bible-facts-mysteries';
    channelName: string;
    path: string;
    title: string;
    input: string;
    runId: string;
    agentId: string;
    masterBibleActive: boolean;
    masterBibleSourceName: string;
    phase: 'start' | 'completed' | 'error';
    output?: string;
    error?: string;
    provider?: string;
    model?: string;
    createdAt: string;
  }
): void {
  const floorName = base.floorId === 1 ? 'Lantai 1 · Daily Faith' :
    base.floorId === 2 ? 'Lantai 2 · Bible Stories' : 'Lantai 3 · Bible Facts';
  void appendWorkHistoryToFirestore(uid, {
    id: base.id,
    floorId: base.floorId,
    floorName,
    channelId: base.channelId,
    channelName: base.channelName,
    projectId: base.runId,
    runId: base.runId,
    taskId: base.id,
    agentId: base.agentId,
    agentName: base.agentId,
    stageId: base.path,
    stageTitle: base.path,
    eventType: 'api-execution',
    phase: base.phase,
    title: base.title,
    input: base.input,
    output: base.output ?? '',
    error: base.error ?? '',
    detail: base.path,
    provider: base.provider ?? '',
    model: base.model ?? '',
    masterBibleActive: base.masterBibleActive,
    masterBibleSourceName: base.masterBibleSourceName,
    createdAt: base.createdAt,
    completedAt: base.phase === 'start' ? '' : new Date().toISOString(),
  }).catch(() => undefined);
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
      !requestUrl.pathname.startsWith('/api/youtube/') &&
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
      ...(method !== 'GET' && method !== 'HEAD' && nextBody !== undefined ? { body: nextBody } : {}),
    };

    let auditBase: {
      id: string;
      floorId: AuditFloorId;
      channelId: 'daily-faith-inspiration' | 'bible-stories-3d' | 'bible-facts-mysteries';
      channelName: string;
      path: string;
      title: string;
      input: string;
      runId: string;
      agentId: string;
      masterBibleActive: boolean;
      masterBibleSourceName: string;
      phase: 'start' | 'completed' | 'error';
      createdAt: string;
    } | null = null;

    if (method !== 'GET' && method !== 'HEAD') {
      let auditBody: Record<string, unknown> = {};
      if (typeof nextBody === 'string' && nextBody.length <= 1_000_000) {
        try { auditBody = JSON.parse(nextBody) as Record<string, unknown>; } catch { /* keep minimal API log */ }
      }
      const floorId = inferAuditFloor(requestUrl.pathname, auditBody);
      if (floorId) {
        const channelId = floorId === 1 ? 'daily-faith-inspiration' :
          floorId === 2 ? 'bible-stories-3d' : 'bible-facts-mysteries';
        const channelName = floorId === 1 ? 'Daily Faith & Inspiration' :
          floorId === 2 ? 'Bible Stories 3D' : 'Bible Facts & Mysteries';
        const now = new Date().toISOString();
        const id = `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const titleValue = auditBody.title ?? auditBody.topicHint ?? auditBody.command ??
          auditBody.bookScope ?? auditBody.task ?? auditBody.prompt ?? auditBody.reference ??
          auditBody.scopeLabel ?? requestUrl.pathname;
        const safeInput = safeAuditJson(auditBody, 7000);
        const runId = String(auditBody.runId ?? auditBody.projectId ?? auditBody.taskId ?? activeApiWorkContext?.runId ?? id).slice(0, 140);
        const agentId = typeof auditBody.agentId === 'string' ? auditBody.agentId.slice(0, 80) : '';
        const masterBibleActive = auditBody.masterBibleActive === true;
        const masterBibleSourceName = typeof auditBody.masterBibleSourceName === 'string'
          ? auditBody.masterBibleSourceName.slice(0, 200) : '';
        auditBase = {
          id, floorId, channelId, channelName, path: `${method} ${requestUrl.pathname}`,
          title: String(titleValue).slice(0, 220), input: safeInput, runId, agentId,
          masterBibleActive, masterBibleSourceName, phase: 'start', createdAt: now,
        };
        appendApiAuditEvent(user.uid, auditBase);
      }
    }

    try {
      const response = await originalFetch(input, nextInit);
      if (auditBase) {
        let payload: Record<string, unknown> = {};
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.toLowerCase().includes('application/json')) {
          try {
            payload = await response.clone().json() as Record<string, unknown>;
          } catch {
            payload = {};
          }
        }
        const provider = typeof payload.providerUsed === 'string' ? payload.providerUsed : '';
        const model = typeof payload.modelUsed === 'string' ? payload.modelUsed : '';
        const error = typeof payload.error === 'string'
          ? payload.error.slice(0, 3500)
          : response.ok ? '' : `HTTP ${response.status} ${response.statusText}`;
        appendApiAuditEvent(user.uid, {
          ...auditBase,
          id: `${auditBase.id}_${response.ok ? 'done' : 'error'}`,
          phase: response.ok ? 'completed' : 'error',
          output: response.ok ? safeAuditJson(payload) : '',
          error,
          provider,
          model,
        });
      }
      return response;
    } catch (error) {
      if (auditBase) {
        appendApiAuditEvent(user.uid, {
          ...auditBase,
          id: `${auditBase.id}_network_error`,
          phase: 'error',
          error: error instanceof Error ? error.message : 'Network request failed.',
        });
      }
      throw error;
    }
  };
}
