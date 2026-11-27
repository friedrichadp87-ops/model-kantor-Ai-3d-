import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProviderConfig } from '../office/providerConfig';
import { createDefaultChannelTemplates, createInitialShortsQueue } from '../office/shortsFactory';
import {
  FIRESTORE_PATHS,
  MASTER_BIBLE_FIRESTORE_RULES_SNIPPET,
  chunkMasterBibleForFirestore,
  formatFirebaseAuthError,
  isPermissionDeniedError,
  reassembleMasterBibleFromFirestore,
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
  assert.equal(FIRESTORE_PATHS.masterBibleMetaDoc('u123'), 'users/u123/masterBible/meta');
  assert.equal(
    FIRESTORE_PATHS.masterBibleChunksCollection('u123'),
    'users/u123/masterBibleChunks'
  );
  assert.equal(
    FIRESTORE_PATHS.masterBibleChunkDoc('u123', 2),
    'users/u123/masterBibleChunks/chunk_002'
  );
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

test('chunkMasterBibleForFirestore splits large Bibles below 1 MB limit and reassembles losslessly', () => {
  const versesMap: Record<string, string> = {};
  for (let ch = 1; ch <= 10; ch++) {
    for (let v = 1; v <= 30; v++) {
      versesMap[`mazmur:${ch}:${v}`] =
        `Ayat uji pasal ${ch} ayat ${v}: Nantikanlah TUHAN! Kuatkanlah dan teguhkanlah hatimu!`;
    }
  }

  const original = {
    versesMap,
    report: {
      indexedVerseCount: 300,
      bookCount: 1,
      chapterCount: 10,
      missingBookCount: 65,
      sourceName: 'Alkitab Terjemahan Baru (indo_tb.json)',
      publisher: 'LAI',
      year: 'TB',
      copyrightStatement: 'Internal studio TB',
    },
  };

  // Force small chunk size to verify multi-chunk splitting and deterministic ordering
  const chunked = chunkMasterBibleForFirestore('uid_tb', original, {
    maxBytesPerChunk: 12_000,
    maxVersesPerChunk: 80,
    nowIso: '2026-11-25T14:00:00.000Z',
  });

  assert.ok(chunked.chunks.length >= 4, 'Expected at least 4 chunks');
  assert.equal(chunked.meta.chunkCount, chunked.chunks.length);
  assert.equal(chunked.meta.indexedVerseCount, 300);
  assert.equal(chunked.chunks[0].chunkId, 'chunk_000');

  for (const chunk of chunked.chunks) {
    const serializedBytes = new TextEncoder().encode(JSON.stringify(chunk.payload)).length;
    assert.ok(serializedBytes < 500_000, `Chunk exceeded safe Firestore size: ${serializedBytes}`);
    assert.equal(chunk.payload.ownerUid, 'uid_tb');
  }

  // Reassemble out-of-order chunks to prove chunkIndex sorting works
  const reversedPayloads = [...chunked.chunks].reverse().map((c) => c.payload);
  const restored = reassembleMasterBibleFromFirestore(chunked.meta, reversedPayloads);
  assert.ok(restored);
  assert.equal(restored.report.indexedVerseCount, 300);
  assert.equal(restored.report.bookCount, 1);
  assert.equal(restored.versesMap['mazmur:1:1'], original.versesMap['mazmur:1:1']);
  assert.equal(restored.versesMap['mazmur:10:30'], original.versesMap['mazmur:10:30']);
  assert.ok(MASTER_BIBLE_FIRESTORE_RULES_SNIPPET.includes('masterBibleChunks'));
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
