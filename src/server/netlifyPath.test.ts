import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNetlifyApiPath } from './netlifyPath';
import { createNetlifyApiHandler } from '../../netlify/functions/api';

test('normalizeNetlifyApiPath cleanly normalizes Netlify Function prefixes and preserves query strings', () => {
  assert.equal(
    normalizeNetlifyApiPath('/.netlify/functions/api/api/providers/status'),
    '/api/providers/status'
  );
  assert.equal(
    normalizeNetlifyApiPath('/.netlify/functions/api/providers/status?floor=1'),
    '/api/providers/status?floor=1'
  );
  assert.equal(
    normalizeNetlifyApiPath('/api/agent/run'),
    '/api/agent/run'
  );
  assert.equal(
    normalizeNetlifyApiPath('/api/api/bible/master/status'),
    '/api/bible/master/status'
  );
});

test('Netlify Function handler executes Express /api/providers/status for a verified owner', async () => {
  const handler = createNetlifyApiHandler({
    verifyToken: async () => ({
      aud: 'kantor-ai-agent-creator',
      auth_time: 1,
      exp: 4_102_444_800,
      iat: 1,
      iss: 'https://securetoken.google.com/kantor-ai-agent-creator',
      sub: 'test-owner',
    }),
    isUidAllowed: (uid) => uid === 'test-owner',
  });
  const response = (await handler(
    {
      httpMethod: 'GET',
      path: '/.netlify/functions/api/api/providers/status',
      headers: {
        host: 'officecontent.netlify.app',
        authorization: 'Bearer test.firebase.token',
      },
      queryStringParameters: {},
      body: null,
      isBase64Encoded: false,
    },
    {}
  )) as { statusCode: number; body: string; headers?: Record<string, string> };

  assert.equal(response.statusCode, 200);
  const parsed = JSON.parse(response.body) as {
    gemini?: { configured?: boolean };
    channelRouting?: unknown[];
  };
  assert.equal(typeof parsed.gemini?.configured, 'boolean');
  assert.ok(Array.isArray(parsed.channelRouting) && parsed.channelRouting.length === 3);
});
