import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEdgeTtsPayload,
  normalizeEdgeTtsWorkerUrl,
  validateEdgeTtsPayload,
} from './edgeTtsClient';

test('normalizeEdgeTtsWorkerUrl only allows local HTTP or remote HTTPS', () => {
  assert.deepEqual(normalizeEdgeTtsWorkerUrl('http://127.0.0.1:8765/'), {
    ok: true,
    url: 'http://127.0.0.1:8765',
  });
  assert.equal(normalizeEdgeTtsWorkerUrl('https://worker.example.com/').ok, true);
  assert.equal(normalizeEdgeTtsWorkerUrl('http://worker.example.com/').ok, false);
  assert.equal(normalizeEdgeTtsWorkerUrl('http://localhost:8765/?token=x').ok, false);
});

test('buildEdgeTtsPayload supports dialogue voices and pause timing', () => {
  const payload = buildEdgeTtsPayload('job-1', 'id-ID-ArdiNeural', '-5%', '+0Hz', [
    { role: 'narator', voice: 'id-ID-GadisNeural', text: 'Pada suatu hari...', pauseMs: 600 },
    { role: 'tokoh', voice: 'id-ID-ArdiNeural', text: 'Mari kita pergi.', pauseMs: 400 },
  ]);
  assert.equal(payload.segments.length, 2);
  assert.equal(validateEdgeTtsPayload(payload).ok, true);
  assert.throws(() => buildEdgeTtsPayload('job-1', 'id-ID-ArdiNeural', '-5%', '+0Hz', [
    { role: 'narator', text: 'Halo.', pauseMs: 20000 },
  ]));
});

test('Edge-TTS payload rejects unknown voices and oversized scripts', () => {
  const unknown = {
    jobId: 'job-2',
    voice: 'id-ID-ArdiNeural',
    rate: '-5%',
    pitch: '+0Hz',
    segments: [{ role: 'narator', voice: 'voice-unknown', text: 'Halo.' }],
  } as unknown as Parameters<typeof validateEdgeTtsPayload>[0];
  assert.equal(validateEdgeTtsPayload(unknown).ok, false);
  const tooLong = buildEdgeTtsPayload('job-3', 'id-ID-ArdiNeural', '-5%', '+0Hz', [
    { role: 'narator', text: 'x'.repeat(10001) },
  ]);
  assert.equal(validateEdgeTtsPayload(tooLong).ok, false);
});
