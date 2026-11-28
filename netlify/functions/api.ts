import serverless from 'serverless-http';
import { createApiApp, type ApiAppSecurityOverrides } from '../../server.ts';

/**
 * Netlify Functions proxy for all Kantor AI 3D /api/* endpoints.
 * Reads GEMINI_API_KEY, per-channel GEMINI_API_KEY_*, and ELEVENLABS_API_KEY
 * securely from Netlify Site configuration -> Environment variables.
 */
export function createNetlifyApiHandler(securityOverrides: ApiAppSecurityOverrides = {}) {
  return serverless(createApiApp(securityOverrides), {
    binary: ['audio/*', 'video/*', 'image/*', 'application/octet-stream'],
  });
}

export const handler = createNetlifyApiHandler();
