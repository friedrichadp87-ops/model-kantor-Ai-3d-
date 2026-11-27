import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNetlifyApiPath } from './netlifyPath';
import { handler as netlifyApiHandler } from '../../netlify/functions/api';

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

test('Netlify Function handler executes Express /api/providers/status and returns valid JSON', async () => {
  const response = (await netlifyApiHandler(
    {
      httpMethod: 'GET',
      path: '/.netlify/functions/api/api/providers/status',
      headers: { host: 'officecontent.netlify.app' },
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
