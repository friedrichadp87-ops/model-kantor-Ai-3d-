import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createYoutubeOAuthState,
  decryptYoutubeRefreshToken,
  encryptYoutubeRefreshToken,
  isYoutubeChannelId,
  isYoutubePrivacyStatus,
  sanitizeYoutubeConnection,
  verifyYoutubeOAuthState,
} from './youtubeOAuth';

const secret = 'unit-test-state-secret-that-is-longer-than-32-characters';
const key = Buffer.from('0123456789abcdef0123456789abcdef');

test('YouTube OAuth state is signed, UID-bound, and expires after ten minutes', () => {
  const state = createYoutubeOAuthState('owner-uid', 'bible-stories-3d', secret, 1_000_000);
  const parsed = verifyYoutubeOAuthState(state, secret, 1_000_000 + 60_000);
  assert.equal(parsed.uid, 'owner-uid');
  assert.equal(parsed.channelId, 'bible-stories-3d');
  assert.throws(() => verifyYoutubeOAuthState(state, secret + '-tampered', 1_000_000 + 60_000));
  assert.throws(() => verifyYoutubeOAuthState(state, secret, 1_000_000 + 11 * 60_000));
});

test('YouTube OAuth state rejects tampering and unknown channel IDs', () => {
  const state = createYoutubeOAuthState('owner-uid', 'daily-faith-inspiration', secret, 2_000_000);
  const [payload, signature] = state.split('.');
  const tamperedPayload = Buffer.from(
    JSON.stringify({
      version: 1,
      uid: 'other-user',
      channelId: 'daily-faith-inspiration',
      issuedAt: 2_000_000,
      nonce: '12345678901234567890',
    })
  ).toString('base64url');
  assert.notEqual(payload, tamperedPayload);
  assert.throws(() => verifyYoutubeOAuthState(`${tamperedPayload}.${signature}`, secret, 2_000_000));
  assert.equal(isYoutubeChannelId('bible-facts-mysteries'), true);
  assert.equal(isYoutubeChannelId('unknown-channel'), false);
  assert.equal(isYoutubePrivacyStatus('private'), true);
  assert.equal(isYoutubePrivacyStatus('everyone'), false);
});

test('YouTube refresh tokens are encrypted with authenticated AES-256-GCM and round-trip', () => {
  const encoded = encryptYoutubeRefreshToken('refresh-token-secret', key);
  assert.ok(!encoded.includes('refresh-token-secret'));
  assert.equal(decryptYoutubeRefreshToken(encoded, key), 'refresh-token-secret');
  assert.throws(() => decryptYoutubeRefreshToken(encoded, Buffer.alloc(32, 7)));
});

test('connection response never exposes encrypted refresh token or internal fields', () => {
  const result = sanitizeYoutubeConnection('bible-stories-3d', {
    status: 'connected',
    encryptedRefreshToken: 'must-never-return',
    autoUploadEnabled: true,
    privacyStatus: 'unlisted',
    googleEmail: 'channel@example.com',
    targetChannelLabel: 'Bible Stories',
    connectedAt: '2026-11-28T00:00:00.000Z',
  });
  assert.equal(result.connected, true);
  assert.equal(result.autoUploadEnabled, true);
  assert.equal(result.privacyStatus, 'unlisted');
  assert.equal('encryptedRefreshToken' in result, false);
});
