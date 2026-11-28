import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedFirebaseUid, verifyFirebaseIdToken } from './firebaseIdToken';

test('Firebase ID token verifier rejects unsupported JWT algorithms before trusting claims', async () => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = [
    encode({ alg: 'HS256', kid: 'not-a-google-key', typ: 'JWT' }),
    encode({ aud: 'kantor-ai-agent-creator', sub: 'owner-uid' }),
    'signature',
  ].join('.');
  await assert.rejects(verifyFirebaseIdToken(token), /Unsupported Firebase ID token signature/);
});

test('production API access fails closed until an owner UID allowlist is configured', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAllowed = process.env.FIREBASE_ALLOWED_UIDS;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.FIREBASE_ALLOWED_UIDS;
    assert.equal(isAllowedFirebaseUid('any-user'), false);

    process.env.FIREBASE_ALLOWED_UIDS = 'owner-uid,second-owner';
    assert.equal(isAllowedFirebaseUid('owner-uid'), true);
    assert.equal(isAllowedFirebaseUid('second-owner'), true);
    assert.equal(isAllowedFirebaseUid('random-user'), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousAllowed === undefined) delete process.env.FIREBASE_ALLOWED_UIDS;
    else process.env.FIREBASE_ALLOWED_UIDS = previousAllowed;
  }
});
