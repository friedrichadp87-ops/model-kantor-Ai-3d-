import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultProviderConfig,
  mergeProviderConfig,
  normalizeOllamaBaseUrl,
  resolveLlmExecutionOrder,
  validateElevenLabsTtsRequest,
  validateProviderConfig,
} from './providerConfig';

test('normalizeOllamaBaseUrl strips trailing slashes and rejects invalid protocols', () => {
  assert.deepEqual(normalizeOllamaBaseUrl('http://localhost:11434///'), {
    ok: true,
    url: 'http://localhost:11434',
  });
  assert.deepEqual(normalizeOllamaBaseUrl('https://ollama.my-studio.dev/'), {
    ok: true,
    url: 'https://ollama.my-studio.dev',
  });
  assert.equal(normalizeOllamaBaseUrl('ftp://localhost:11434').ok, false);
  assert.equal(normalizeOllamaBaseUrl('not-a-url').ok, false);
  assert.equal(normalizeOllamaBaseUrl('   ').ok, false);
});

test('mergeProviderConfig safely restores defaults on corrupt or partial input', () => {
  const defaults = createDefaultProviderConfig();
  assert.deepEqual(mergeProviderConfig(null), defaults);

  const merged = mergeProviderConfig({
    llmRouting: 'ollama',
    ollama: {
      enabled: true,
      baseUrl: 'http://localhost:11434/',
      model: 'qwen2.5:7b',
      connectionMode: 'browser',
    },
    gemini: { textModel: 'gemini-3.1-flash-lite' },
    elevenlabs: {
      enabled: true,
      voiceId: 'pNInz6obpgDQGcFmaJgB',
      modelId: 'eleven_flash_v2_5',
      stability: 1.8,
      similarityBoost: -0.2,
    },
  });

  assert.equal(merged.llmRouting, 'ollama');
  assert.equal(merged.ollama.baseUrl, 'http://localhost:11434');
  assert.equal(merged.ollama.model, 'qwen2.5:7b');
  assert.equal(merged.ollama.connectionMode, 'browser');
  assert.equal(merged.gemini.textModel, 'gemini-3.1-flash-lite');
  assert.equal(merged.elevenlabs.modelId, 'eleven_flash_v2_5');
  assert.equal(merged.elevenlabs.stability, 1);
  assert.equal(merged.elevenlabs.similarityBoost, 0);
  assert.equal(merged.voiceProvider, 'elevenlabs');
  assert.equal(merged.edgeTts.workerUrl, 'http://127.0.0.1:8765');
});

test('validateProviderConfig enforces Ollama enabled when routing is ollama-only', () => {
  const cfg = createDefaultProviderConfig();
  cfg.llmRouting = 'ollama';
  cfg.ollama.enabled = false;

  const check = validateProviderConfig(cfg);
  assert.equal(check.ok, false);

  cfg.ollama.enabled = true;
  const okCheck = validateProviderConfig(cfg);
  assert.equal(okCheck.ok, true);
});

test('resolveLlmExecutionOrder computes deterministic provider fallback order', () => {
  const cfg = createDefaultProviderConfig();
  assert.deepEqual(resolveLlmExecutionOrder(cfg), ['ollama', 'gemini']);

  cfg.ollama.enabled = false;
  assert.deepEqual(resolveLlmExecutionOrder(cfg), ['gemini']);

  cfg.llmRouting = 'gemini';
  cfg.ollama.enabled = true;
  assert.deepEqual(resolveLlmExecutionOrder(cfg), ['gemini']);

  cfg.llmRouting = 'ollama';
  assert.deepEqual(resolveLlmExecutionOrder(cfg), ['ollama']);
});

test('validateElevenLabsTtsRequest validates narration length and voiceId format', () => {
  assert.equal(
    validateElevenLabsTtsRequest({ text: 'Hi', voiceId: '21m00Tcm4TlvDq8ikWAM' }).ok,
    false
  );
  assert.equal(
    validateElevenLabsTtsRequest({ text: 'Damai sejahtera menyertai Anda.', voiceId: 'bad id!' }).ok,
    false
  );
  const ok = validateElevenLabsTtsRequest({
    text: 'Tuhan adalah gembalaku, takkan kekurangan aku.',
    voiceId: '21m00Tcm4TlvDq8ikWAM',
    modelId: 'eleven_multilingual_v2',
    stability: 0.6,
    similarityBoost: 0.8,
  });
  assert.equal(ok.ok, true);
});


test('Edge-TTS settings merge and validate rate, pitch, voice and Worker URL', () => {
  const defaults = createDefaultProviderConfig();
  assert.equal(defaults.voiceProvider, 'edge-tts');
  assert.equal(defaults.edgeTts.voice, 'id-ID-ArdiNeural');
  assert.equal(defaults.edgeTts.rate, '-5%');
  assert.equal(defaults.edgeTts.pitch, '+0Hz');

  const merged = mergeProviderConfig({
    voiceProvider: 'edge-tts',
    edgeTts: {
      workerUrl: 'http://localhost:8765/',
      voice: 'id-ID-GadisNeural',
      rate: '-30%',
      pitch: '+20Hz',
    },
  });
  assert.equal(merged.voiceProvider, 'edge-tts');
  assert.equal(merged.edgeTts.workerUrl, 'http://localhost:8765');
  assert.equal(merged.edgeTts.voice, 'id-ID-GadisNeural');
  assert.equal(merged.edgeTts.rate, '-30%');
  assert.equal(merged.edgeTts.pitch, '+20Hz');

  const invalid = { ...defaults, voiceProvider: 'edge-tts' as const, edgeTts: { ...defaults.edgeTts, rate: '-40%' } };
  assert.equal(validateProviderConfig(invalid).ok, false);
});


test('legacy provider settings without a voiceProvider now default to Edge-TTS', () => {
  const legacy = mergeProviderConfig({
    elevenlabs: {
      enabled: true,
      voiceId: '21m00Tcm4TlvDq8ikWAM',
      voiceName: 'Rachel (Narasi Hangat)',
      modelId: 'eleven_multilingual_v2',
      stability: 0.55,
      similarityBoost: 0.75,
    },
  });
  assert.equal(legacy.voiceProvider, 'edge-tts');
  assert.equal(legacy.elevenlabs.voiceId, '21m00Tcm4TlvDq8ikWAM');
});

test('ElevenLabs remains selectable as an explicit secondary provider', () => {
  const config = mergeProviderConfig({ voiceProvider: 'elevenlabs' });
  assert.equal(config.voiceProvider, 'elevenlabs');
  assert.equal(config.elevenlabs.enabled, true);
});
