import { createVerify } from 'node:crypto';

const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

interface FirebaseTokenHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

export interface FirebaseTokenClaims {
  aud: string;
  auth_time: number;
  exp: number;
  iat: number;
  iss: string;
  sub: string;
  user_id?: string;
  uid?: string;
  email?: string;
  email_verified?: boolean;
  firebase?: {
    sign_in_provider?: string;
    identities?: Record<string, string[]>;
  };
  [key: string]: unknown;
}

interface CertificateCache {
  certificates: Record<string, string>;
  expiresAt: number;
}

let certificateCache: CertificateCache | null = null;
let certificateFetch: Promise<Record<string, string>> | null = null;

function decodeJwtPart<T>(part: string): T {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
}

async function loadFirebaseCertificates(): Promise<Record<string, string>> {
  if (certificateCache && certificateCache.expiresAt > Date.now()) {
    return certificateCache.certificates;
  }
  if (certificateFetch) return certificateFetch;

  certificateFetch = (async () => {
    const response = await fetch(FIREBASE_CERTS_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      throw new Error(`Firebase public certificate endpoint returned HTTP ${response.status}.`);
    }

    const certificates = (await response.json()) as Record<string, string>;
    if (!certificates || typeof certificates !== 'object' || Object.keys(certificates).length === 0) {
      throw new Error('Firebase returned an empty public certificate set.');
    }

    const cacheControl = response.headers.get('cache-control') ?? '';
    const maxAge = Number(/max-age=(\d+)/i.exec(cacheControl)?.[1] ?? 3600);
    certificateCache = {
      certificates,
      expiresAt: Date.now() + Math.max(60, Math.min(maxAge, 24 * 3600)) * 1000,
    };
    return certificates;
  })();

  try {
    return await certificateFetch;
  } finally {
    certificateFetch = null;
  }
}

/**
 * Verifies a Firebase Authentication ID token using Google's published Secure Token
 * signing certificates. This is intentionally fail-closed: missing/expired certs or
 * invalid claims never grant access. No service-account key is needed by Netlify.
 */
export async function verifyFirebaseIdToken(token: string): Promise<FirebaseTokenClaims> {
  if (typeof token !== 'string' || token.length < 100 || token.length > 12_000) {
    throw new Error('Invalid Firebase ID token length.');
  }

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed Firebase ID token.');

  const header = decodeJwtPart<FirebaseTokenHeader>(parts[0]);
  const claims = decodeJwtPart<FirebaseTokenClaims>(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported Firebase ID token signature.');
  }

  const projectId = (process.env.FIREBASE_PROJECT_ID || 'kantor-ai-agent-creator').trim();
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const now = Math.floor(Date.now() / 1000);

  if (
    claims.aud !== projectId ||
    claims.iss !== expectedIssuer ||
    typeof claims.sub !== 'string' ||
    claims.sub.length === 0 ||
    claims.sub.length > 128 ||
    !Number.isFinite(claims.exp) ||
    !Number.isFinite(claims.iat) ||
    !Number.isFinite(claims.auth_time) ||
    claims.exp <= now ||
    claims.iat > now + 300 ||
    claims.auth_time > now + 300
  ) {
    throw new Error('Firebase ID token claims are invalid or expired.');
  }

  const certificates = await loadFirebaseCertificates();
  const certificate = certificates[header.kid];
  if (!certificate) throw new Error('Firebase ID token signing key is unknown.');

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const isValid = verifier.verify(certificate, Buffer.from(parts[2], 'base64url'));
  if (!isValid) throw new Error('Firebase ID token signature verification failed.');

  return claims;
}

export function isAllowedFirebaseUid(uid: string): boolean {
  const configured = (process.env.FIREBASE_ALLOWED_UIDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.length === 0 || configured.includes(uid);
}
