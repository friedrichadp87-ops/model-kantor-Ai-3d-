import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProviderConfig } from '../office/providerConfig';
import { createDefaultChannelTemplates, createInitialShortsQueue } from '../office/shortsFactory';
import {
  FIRESTORE_PATHS,
  formatFirebaseAuthError,
  isPermissionDeniedError,
  sanitizeAgentTaskPayload,
  sanitizeShortsQueueItemPayload,
  sanitizeUserProfilePayload,
  sanitizeWorkspaceSettingsPayload,
} from './officeSync';

test('FIRESTORE_PATHS builds deterministic per-user paths matching firebase-blueprint.json', () => {
  assert.equal(FIRESTORE_PATHS.userDoc('u123'), 'users/u123');
  assert.equal(FIRESTORE_PATHS.workspaceSettingsDoc('u123'), 'users/u123/workspace/settings');
  assert.equal(FIRESTORE_PATHS.shortsQueueCollection('u123'), 'users/u123/shortsQueue');
  assert.equal(FIRESTORE_PATHS.shortsQueueDoc('u123', 'job1'), 'users/u123/shortsQueue/job1');
  assert.equal(FIRESTORE_PATHS.agentTasksCollection('u123'), 'users/u123/agentTasks');
  assert.equal(FIRESTORE_PATHS.agentTaskDoc('u123', 't1'), 'users/u123/agentTasks/t1');
});

test('payload sanitizers strip undefined, bound string lengths, and match Firestore Rules', () => {
  const profile = sanitizeUserProfilePayload({
    uid: 'uid_abc',
    email: 'owner@example.com',
    displayName: '  Pemilik Studio  ',
    photoURL: null,
    providerIds: ['google.com'],
  });
  assert.deepEqual(profile, {
    email: 'owner@example.com',
    displayName: 'Pemilik Studio',
  });

  const fallbackProfile = sanitizeUserProfilePayload({
    uid: 'uid_abc',
    email: 'creator@example.com',
    displayName: '   ',
    photoURL: null,
    providerIds: ['google.com'],
  });
  assert.equal(fallbackProfile.displayName, 'creator');

  const longNameProfile = sanitizeUserProfilePayload({
    uid: 'uid_abc',
    email: 'creator@example.com',
    displayName: 'X'.repeat(150),
    photoURL: null,
    providerIds: ['google.com'],
  });
  assert.equal(longNameProfile.displayName.length, 80);

  const defaultProviders = createDefaultProviderConfig();
  const settings = sanitizeWorkspaceSettingsPayload(
    'uid_abc',
    createDefaultChannelTemplates(),
    {
      ...defaultProviders,
      elevenlabs: {
        ...defaultProviders.elevenlabs,
        stability: 1.8,
        similarityBoost: -0.2,
      },
    },
    '2026-11-23T00:00:00.000Z'
  );
  assert.equal(settings.ownerUid, 'uid_abc');
  assert.equal(settings.providerConfig.ollama.baseUrl, 'http://127.0.0.1:11434');
  assert.equal(settings.providerConfig.elevenlabs.stability, 1);
  assert.equal(settings.providerConfig.elevenlabs.similarityBoost, 0);

  const sampleJob = createInitialShortsQueue()[0];
  const safeJob = sanitizeShortsQueueItemPayload('uid_abc', sampleJob);
  assert.equal(safeJob.ownerUid, 'uid_abc');
  assert.equal(safeJob.channelId, sampleJob.channelId);

  const hugePrompt = 'a'.repeat(5000);
  const hugeOutput = 'b'.repeat(20000);
  const safeTask = sanitizeAgentTaskPayload('uid_abc', {
    id: 'task_1',
    agentId: 'ceo',
    prompt: hugePrompt,
    output: hugeOutput,
    status: 'completed',
    createdAt: '2026-11-23T00:00:00.000Z',
  });
  assert.equal(safeTask.prompt.length, 2000);
  assert.equal(safeTask.output.length, 12000);
  assert.equal(safeTask.error, '');
});

test('formatFirebaseAuthError returns actionable Indonesian guidance for common auth codes', () => {
  const unauthDomain = formatFirebaseAuthError(
    { code: 'auth/unauthorized-domain' },
    'ais-dev.example.run.app'
  );
  assert.match(unauthDomain, /ais-dev\.example\.run\.app/);
  assert.match(unauthDomain, /Authorized domains/);

  assert.match(formatFirebaseAuthError({ code: 'auth/operation-not-allowed' }), /Sign-in method/);
  assert.match(formatFirebaseAuthError({ code: 'auth/invalid-credential' }), /tidak cocok/);
  assert.equal(isPermissionDeniedError({ code: 'permission-denied' }), true);
  assert.equal(
    isPermissionDeniedError(new Error('FirebaseError: Missing or insufficient permissions.')),
    true
  );
  assert.equal(isPermissionDeniedError(new Error('network error')), false);
});
