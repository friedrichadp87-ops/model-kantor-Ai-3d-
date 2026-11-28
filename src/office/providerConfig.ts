import type { ChannelKeySlotStatus } from './productionPipeline';

export type LlmRoutingMode = 'auto' | 'ollama' | 'gemini';
export type OllamaConnectionMode = 'proxy' | 'browser';
export type GeminiTextModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
export type ElevenLabsModelId =
  | 'eleven_multilingual_v2'
  | 'eleven_flash_v2_5'
  | 'eleven_turbo_v2_5';

export const EDGE_TTS_VOICE_PRESETS = [
  { id: 'id-ID-ArdiNeural', label: 'Ardi · Pria Indonesia · Hangat/Tegas' },
  { id: 'id-ID-GadisNeural', label: 'Gadis · Wanita Indonesia · Dongeng Lembut' },
  { id: 'en-US-AndrewNeural', label: 'Andrew · Pria Inggris · Storytelling' },
  { id: 'en-US-AriaNeural', label: 'Aria · Wanita Inggris · Ekspresif' },
] as const;

export type EdgeTtsVoiceId = (typeof EDGE_TTS_VOICE_PRESETS)[number]['id'];
export type VoiceProvider = 'edge-tts' | 'elevenlabs';

export interface EdgeTtsConfig {
  workerUrl: string;
  voice: EdgeTtsVoiceId;
  rate: string;
  pitch: string;
}

export function normalizeEdgeTtsWorkerUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (!value) return { ok: false, error: 'URL Windows Production Worker wajib diisi.' };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: 'URL Worker tidak valid. Contoh: http://127.0.0.1:8765.' };
  }

  const host = parsed.hostname.toLowerCase();
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
    return { ok: false, error: 'Worker harus memakai HTTPS, kecuali Worker lokal pada localhost/127.0.0.1.' };
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return { ok: false, error: 'URL Worker tidak boleh berisi kredensial, query, atau hash.' };
  }

  return {
    ok: true,
    url: `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, ''),
  };
}

export function validateEdgeTtsSettings(input: {
  workerUrl?: unknown;
  voice?: unknown;
  rate?: unknown;
  pitch?: unknown;
}): { ok: true; value: EdgeTtsConfig } | { ok: false; error: string } {
  const url = normalizeEdgeTtsWorkerUrl(typeof input.workerUrl === 'string' ? input.workerUrl : '');
  if (!url.ok) return url;

  const voice = typeof input.voice === 'string' && EDGE_TTS_VOICE_PRESETS.some((preset) => preset.id === input.voice)
    ? input.voice as EdgeTtsVoiceId
    : null;
  if (!voice) return { ok: false, error: 'Pilih salah satu preset suara Edge-TTS yang tersedia.' };

  const rate = typeof input.rate === 'string' && /^[+-]?(?:0|[1-2]?\d|30)%$/.test(input.rate)
    ? input.rate
    : null;
  if (!rate || Number(rate.replace('%', '')) < -30 || Number(rate.replace('%', '')) > 30) {
    return { ok: false, error: 'Rate harus berada pada rentang -30% sampai +30%.' };
  }

  const pitch = typeof input.pitch === 'string' && /^[+-]?(?:0|[1-2]?\d|20)Hz$/.test(input.pitch)
    ? input.pitch
    : null;
  if (!pitch || Number(pitch.replace('Hz', '')) < -20 || Number(pitch.replace('Hz', '')) > 20) {
    return { ok: false, error: 'Pitch harus berada pada rentang -20Hz sampai +20Hz.' };
  }

  return { ok: true, value: { workerUrl: url.url, voice, rate, pitch } };
}

export interface OllamaConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  connectionMode: OllamaConnectionMode;
}

export interface GeminiProviderConfig {
  textModel: GeminiTextModelId;
}

export interface ElevenLabsConfig {
  enabled: boolean;
  voiceId: string;
  voiceName: string;
  modelId: ElevenLabsModelId;
  stability: number;
  similarityBoost: number;
}

export interface ProviderConfig {
  llmRouting: LlmRoutingMode;
  voiceProvider: VoiceProvider;
  edgeTts: EdgeTtsConfig;
  ollama: OllamaConfig;
  gemini: GeminiProviderConfig;
  elevenlabs: ElevenLabsConfig;
}

export interface ServerProviderStatus {
  gemini: {
    configured: boolean;
    defaultModel: GeminiTextModelId;
  };
  elevenlabs: {
    configured: boolean;
    defaultVoiceId: string;
    defaultModelId: ElevenLabsModelId;
  };
  ollama: {
    defaultBaseUrl: string;
    defaultModel: string;
  };
  channelRouting?: ChannelKeySlotStatus[];
  ffmpegAvailable?: boolean;
}

export const PROVIDER_CONFIG_STORAGE_KEY = 'kantor_ai_provider_config_v1';

export const OLLAMA_MODEL_PRESETS = [
  { id: 'llama3.2', label: 'llama3.2 (Ringan & Cepat)' },
  { id: 'qwen2.5:7b', label: 'qwen2.5:7b (Bahasa Indonesia Kuat)' },
  { id: 'gemma3:4b', label: 'gemma3:4b (Efisien Lokal)' },
  { id: 'mistral', label: 'mistral (Penalaran Umum)' },
] as const;

export const GEMINI_TEXT_MODELS: Array<{
  id: GeminiTextModelId;
  label: string;
  note: string;
}> = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    note: 'Utama untuk 13 agen, naskah Shorts, dan audit Guardian',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    note: 'Respons cepat dengan konsumsi kuota hemat',
  },
];

export const ELEVENLABS_MODELS: Array<{
  id: ElevenLabsModelId;
  label: string;
  note: string;
}> = [
  {
    id: 'eleven_multilingual_v2',
    label: 'Eleven Multilingual v2',
    note: 'Kualitas narasi Bahasa Indonesia paling ekspresif',
  },
  {
    id: 'eleven_flash_v2_5',
    label: 'Eleven Flash v2.5',
    note: 'Latensi sangat rendah untuk pratinjau cepat',
  },
  {
    id: 'eleven_turbo_v2_5',
    label: 'Eleven Turbo v2.5',
    note: 'Seimbang antara kecepatan & kejernihan suara',
  },
];

export const ELEVENLABS_VOICE_PRESETS = [
  { voiceId: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Narasi Hangat)' },
  { voiceId: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Dokumenter / Fakta)' },
  { voiceId: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Cerita Anak 3D)' },
  { voiceId: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Renungan Tenang)' },
] as const;

export function createDefaultProviderConfig(): ProviderConfig {
  return {
    llmRouting: 'auto',
    ollama: {
      enabled: true,
      baseUrl: 'http://127.0.0.1:11434',
      model: 'llama3.2',
      connectionMode: 'proxy',
    },
    gemini: {
      textModel: 'gemini-4-hydrogen',
    },
    voiceProvider: 'edge-tts',
    edgeTts: {
      workerUrl: 'http://127.0.0.1:8765',
      voice: 'id-ID-ArdiNeural',
      rate: '-5%',
      pitch: '+0Hz',
    },
    elevenlabs: {
      enabled: true,
      voiceId: '21m00Tcm4TlvDq8ikWAM',
      voiceName: 'Rachel (Narasi Hangat)',
      modelId: 'eleven_multilingual_v2',
      stability: 0.55,
      similarityBoost: 0.75,
    },
  };
}

export function normalizeOllamaBaseUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'URL server Ollama wajib diisi (contoh: http://127.0.0.1:11434).' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: 'Format URL Ollama tidak valid. Gunakan awalan http:// atau https://.',
    };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: 'URL Ollama hanya mendukung protokol http:// atau https://.',
    };
  }
  const normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, '');
  return { ok: true, url: normalized };
}

function clampUnit(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

export function mergeProviderConfig(raw: unknown): ProviderConfig {
  const defaults = createDefaultProviderConfig();
  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as Record<string, unknown>;

  const routingRaw = obj.llmRouting;
  const llmRouting: LlmRoutingMode =
    routingRaw === 'auto' || routingRaw === 'ollama' || routingRaw === 'gemini'
      ? routingRaw
      : defaults.llmRouting;

  const ollamaRaw = (obj.ollama && typeof obj.ollama === 'object'
    ? obj.ollama
    : {}) as Record<string, unknown>;
  const baseUrlCandidate =
    typeof ollamaRaw.baseUrl === 'string' ? ollamaRaw.baseUrl : defaults.ollama.baseUrl;
  const normalizedUrl = normalizeOllamaBaseUrl(baseUrlCandidate);

  const geminiRaw = (obj.gemini && typeof obj.gemini === 'object'
    ? obj.gemini
    : {}) as Record<string, unknown>;
  const geminiModel: GeminiTextModelId =
    geminiRaw.textModel === 'gemini-3.1-flash-lite'
      ? 'gemini-3.1-flash-lite'
      : 'gemini-4-hydrogen';

  const edgeRaw = (obj.edgeTts && typeof obj.edgeTts === 'object'
    ? obj.edgeTts
    : {}) as Record<string, unknown>;
  const edgeSettings = validateEdgeTtsSettings({
    workerUrl: typeof edgeRaw.workerUrl === 'string' ? edgeRaw.workerUrl : defaults.edgeTts.workerUrl,
    voice: typeof edgeRaw.voice === 'string' ? edgeRaw.voice : defaults.edgeTts.voice,
    rate: typeof edgeRaw.rate === 'string' ? edgeRaw.rate : defaults.edgeTts.rate,
    pitch: typeof edgeRaw.pitch === 'string' ? edgeRaw.pitch : defaults.edgeTts.pitch,
  });
  const voiceProvider: VoiceProvider = obj.voiceProvider === 'elevenlabs' ? 'elevenlabs' : 'edge-tts';

  const elevenRaw = (obj.elevenlabs && typeof obj.elevenlabs === 'object'
    ? obj.elevenlabs
    : {}) as Record<string, unknown>;
  const elevenModel: ElevenLabsModelId =
    elevenRaw.modelId === 'eleven_flash_v2_5' || elevenRaw.modelId === 'eleven_turbo_v2_5'
      ? elevenRaw.modelId
      : 'eleven_multilingual_v2';

  return {
    llmRouting,
    voiceProvider,
    edgeTts: edgeSettings.ok ? edgeSettings.value : defaults.edgeTts,
    ollama: {
      enabled:
        typeof ollamaRaw.enabled === 'boolean' ? ollamaRaw.enabled : defaults.ollama.enabled,
      baseUrl: normalizedUrl.ok ? normalizedUrl.url : defaults.ollama.baseUrl,
      model:
        typeof ollamaRaw.model === 'string' && ollamaRaw.model.trim()
          ? ollamaRaw.model.trim().slice(0, 80)
          : defaults.ollama.model,
      connectionMode: ollamaRaw.connectionMode === 'browser' ? 'browser' : 'proxy',
    },
    gemini: {
      textModel: geminiModel,
    },
    elevenlabs: {
      enabled:
        typeof elevenRaw.enabled === 'boolean'
          ? elevenRaw.enabled
          : defaults.elevenlabs.enabled,
      voiceId:
        typeof elevenRaw.voiceId === 'string' && elevenRaw.voiceId.trim()
          ? elevenRaw.voiceId.trim().slice(0, 80)
          : defaults.elevenlabs.voiceId,
      voiceName:
        typeof elevenRaw.voiceName === 'string' && elevenRaw.voiceName.trim()
          ? elevenRaw.voiceName.trim().slice(0, 80)
          : defaults.elevenlabs.voiceName,
      modelId: elevenModel,
      stability: clampUnit(elevenRaw.stability, defaults.elevenlabs.stability),
      similarityBoost: clampUnit(elevenRaw.similarityBoost, defaults.elevenlabs.similarityBoost),
    },
  };
}

export function validateProviderConfig(
  cfg: ProviderConfig
): { ok: true; value: ProviderConfig } | { ok: false; error: string } {
  const urlCheck = normalizeOllamaBaseUrl(cfg.ollama.baseUrl);
  if (!urlCheck.ok) return urlCheck;

  const model = cfg.ollama.model.trim();
  if (model.length < 2 || model.length > 80) {
    return { ok: false, error: 'Nama model Ollama harus 2–80 karakter (contoh: llama3.2).' };
  }

  const edgeCheck = validateEdgeTtsSettings(cfg.edgeTts);
  if (cfg.voiceProvider === 'edge-tts' && !edgeCheck.ok) return edgeCheck;
  const validatedEdgeTts = edgeCheck.ok ? edgeCheck.value : createDefaultProviderConfig().edgeTts;

  const voiceId = cfg.elevenlabs.voiceId.trim();
  if (voiceId.length < 3 || voiceId.length > 80) {
    return { ok: false, error: 'Voice ID ElevenLabs tidak valid (minimal 3 karakter).' };
  }

  if (cfg.llmRouting === 'ollama' && !cfg.ollama.enabled) {
    return {
      ok: false,
      error: 'Aktifkan koneksi Ollama terlebih dahulu jika memilih mode "Hanya Ollama Lokal".',
    };
  }

  return {
    ok: true,
    value: {
      ...cfg,
      voiceProvider: cfg.voiceProvider === 'edge-tts' ? 'edge-tts' : 'elevenlabs',
      edgeTts: validatedEdgeTts,
      ollama: {
        ...cfg.ollama,
        baseUrl: urlCheck.url,
        model,
      },
      elevenlabs: {
        ...cfg.elevenlabs,
        voiceId,
        stability: clampUnit(cfg.elevenlabs.stability, 0.55),
        similarityBoost: clampUnit(cfg.elevenlabs.similarityBoost, 0.75),
      },
    },
  };
}

export type ExecutionProviderStep = 'ollama' | 'gemini';

export function resolveLlmExecutionOrder(cfg: ProviderConfig): ExecutionProviderStep[] {
  if (cfg.llmRouting === 'gemini') return ['gemini'];
  if (cfg.llmRouting === 'ollama') return ['ollama'];
  return cfg.ollama.enabled ? ['ollama', 'gemini'] : ['gemini'];
}

export function validateElevenLabsTtsRequest(input: {
  text?: unknown;
  voiceId?: unknown;
  modelId?: unknown;
  stability?: unknown;
  similarityBoost?: unknown;
}):
  | {
      ok: true;
      value: {
        text: string;
        voiceId: string;
        modelId: ElevenLabsModelId;
        stability: number;
        similarityBoost: number;
      };
    }
  | { ok: false; error: string } {
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (text.length < 3 || text.length > 800) {
    return { ok: false, error: 'Teks narasi TTS harus antara 3 hingga 800 karakter.' };
  }
  const voiceId = typeof input.voiceId === 'string' ? input.voiceId.trim() : '';
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(voiceId)) {
    return { ok: false, error: 'Format Voice ID ElevenLabs tidak valid.' };
  }
  const modelId: ElevenLabsModelId =
    input.modelId === 'eleven_flash_v2_5' || input.modelId === 'eleven_turbo_v2_5'
      ? input.modelId
      : 'eleven_multilingual_v2';

  return {
    ok: true,
    value: {
      text,
      voiceId,
      modelId,
      stability: clampUnit(input.stability, 0.55),
      similarityBoost: clampUnit(input.similarityBoost, 0.75),
    },
  };
}
