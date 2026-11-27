import serverless from 'serverless-http';
import { createApiApp } from '../../server.ts';

const apiApp = createApiApp();

/**
 * Netlify Functions proxy for all Kantor AI 3D /api/* endpoints.
 * Reads GEMINI_API_KEY, per-channel GEMINI_API_KEY_*, and ELEVENLABS_API_KEY
 * securely from Netlify Site configuration -> Environment variables.
 */
export const handler = serverless(apiApp, {
  binary: ['audio/*', 'video/*', 'image/*', 'application/octet-stream'],
});
