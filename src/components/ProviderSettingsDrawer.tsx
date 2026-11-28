import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  Download,
  Loader2,
  LogIn,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  Youtube,
  X,
} from 'lucide-react';
import { firebaseConfig, type FirestoreSyncStatus } from '../firebase/client';
import type { FirebaseAuthUserSummary } from '../firebase/officeSync';
import {
  ELEVENLABS_MODELS,
  ELEVENLABS_VOICE_PRESETS,
  EDGE_TTS_VOICE_PRESETS,
  GEMINI_TEXT_MODELS,
  OLLAMA_MODEL_PRESETS,
  normalizeOllamaBaseUrl,
  validateElevenLabsTtsRequest,
  validateProviderConfig,
  type ElevenLabsModelId,
  type GeminiTextModelId,
  type LlmRoutingMode,
  type OllamaConnectionMode,
  type ProviderConfig,
  type ServerProviderStatus,
} from '../office/providerConfig';
import type { LightingPreset } from '../office/types';
import { YoutubeSettingsPanel } from './YoutubeSettingsPanel';
import { buildEdgeTtsPayload, generateEdgeTtsAudio } from '../office/edgeTtsClient';

export type ProviderTab = 'ollama' | 'gemini' | 'elevenlabs' | 'firebase' | 'youtube';

interface ProviderSettingsDrawerProps {
  lighting: LightingPreset;
  config: ProviderConfig;
  initialTab?: ProviderTab;
  firebaseUser: FirebaseAuthUserSummary | null;
  firebaseSyncStatus: FirestoreSyncStatus;
  onSaveConfig: (next: ProviderConfig) => void;
  onResetConfig: () => void;
  onOpenChannelTemplates: () => void;
  onOpenFirebaseAuth: () => void;
  onOpenSetupGuide?: () => void;
  onVoiceSynthesisEvent?: (phase: 'start' | 'done' | 'error', label: string) => void;
  onClose: () => void;
}

interface TestFeedback {
  status: 'idle' | 'testing' | 'ok' | 'error';
  message: string;
  latencyMs?: number;
}

interface ElevenLabsVoiceItem {
  voiceId: string;
  name: string;
  category: string;
  accent: string;
}

export function ProviderSettingsDrawer({
  lighting,
  config,
  initialTab = 'ollama',
  firebaseUser,
  firebaseSyncStatus,
  onSaveConfig,
  onResetConfig,
  onOpenChannelTemplates,
  onOpenFirebaseAuth,
  onOpenSetupGuide,
  onVoiceSynthesisEvent,
  onClose,
}: ProviderSettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<ProviderTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [draft, setDraft] = useState<ProviderConfig>(config);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [serverStatus, setServerStatus] = useState<ServerProviderStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState<boolean>(true);

  const [ollamaTest, setOllamaTest] = useState<TestFeedback>({ status: 'idle', message: '' });
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);

  const [geminiTest, setGeminiTest] = useState<TestFeedback>({ status: 'idle', message: '' });

  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [remoteVoices, setRemoteVoices] = useState<ElevenLabsVoiceItem[]>([]);
  const [ttsText, setTtsText] = useState(
    'Damai sejahtera menyertai Anda hari ini. Mari kita merenungkan firman Tuhan dengan hati yang tenang.'
  );
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);

  const ollamaUrlId = useId();
  const ollamaModelId = useId();
  const elevenVoiceIdInput = useId();
  const elevenModelSelectId = useId();
  const ttsInputId = useId();

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const fetchServerStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/providers/status');
      if (res.ok) {
        const data = (await res.json()) as ServerProviderStatus;
        setServerStatus(data);
      }
    } catch {
      // Keep previous status if offline
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    void fetchServerStatus();
  }, []);

  const isDark = lighting === 'malam';
  const surfaceClass = isDark
    ? 'border-slate-700/90 bg-[#0a1322]/97 text-slate-100'
    : 'border-slate-200/95 bg-[#fcfbf8]/97 text-slate-900';
  const subtleBorder = isDark ? 'border-slate-800' : 'border-slate-200/90';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';
  const inputSurface = isDark
    ? 'border-slate-700 bg-[#0e1a2e] text-slate-100 placeholder:text-slate-500'
    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400';
  const panelBg = isDark ? 'border-slate-800 bg-[#0f1c31]/85' : 'border-slate-200 bg-white';
  const tabBarBg = isDark ? 'bg-[#08101c]' : 'bg-slate-100/90';

  const handleSave = (e?: FormEvent) => {
    e?.preventDefault();
    setValidationError(null);
    setSaveNotice(null);
    const check = validateProviderConfig(draft);
    if (!check.ok) {
      setValidationError(check.error);
      return;
    }
    setDraft(check.value);
    onSaveConfig(check.value);
    setSaveNotice('Konfigurasi provider disimpan ke workspace Firestore dan aktif untuk seluruh lantai.');
  };

  const handleTestOllama = async () => {
    const urlCheck = normalizeOllamaBaseUrl(draft.ollama.baseUrl);
    if (!urlCheck.ok) {
      setOllamaTest({ status: 'error', message: urlCheck.error });
      return;
    }

    setOllamaTest({ status: 'testing', message: `Menghubungi ${urlCheck.url}...` });
    const startedAt = Date.now();

    if (draft.ollama.connectionMode === 'browser') {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${urlCheck.url}/api/tags`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          setOllamaTest({
            status: 'error',
            message: `Ollama browser-direct merespons HTTP ${res.status}.`,
          });
          return;
        }
        const data = (await res.json()) as {
          models?: Array<{ name?: string; model?: string }>;
        };
        const models = Array.isArray(data.models)
          ? data.models.map((m) => String(m.name ?? m.model ?? '').trim()).filter(Boolean)
          : [];
        setDiscoveredModels(models);
        setOllamaTest({
          status: 'ok',
          latencyMs: Date.now() - startedAt,
          message:
            models.length > 0
              ? `Terhubung langsung dari browser! Ditemukan ${models.length} model lokal.`
              : 'Terhubung ke Ollama lokal, tetapi belum ada model terunduh (jalankan: ollama pull llama3.2).',
        });
      } catch {
        setOllamaTest({
          status: 'error',
          message:
            'Browser tidak dapat menjangkau Ollama lokal. Pastikan Ollama berjalan dengan OLLAMA_ORIGINS="*" (atau jalankan aplikasi di localhost PC Anda).',
        });
      }
      return;
    }

    try {
      const res = await fetch('/api/providers/ollama/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: urlCheck.url,
          model: draft.ollama.model.trim(),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        models?: string[];
        hasSelectedModel?: boolean;
        latencyMs?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setOllamaTest({
          status: 'error',
          message: data.error ?? 'Gagal menguji koneksi Ollama.',
        });
        return;
      }
      const models = Array.isArray(data.models) ? data.models : [];
      setDiscoveredModels(models);
      setOllamaTest({
        status: 'ok',
        latencyMs: data.latencyMs,
        message:
          models.length > 0
            ? data.hasSelectedModel
              ? `Terhubung ke Ollama (${models.length} model tersedia, model "${draft.ollama.model}" siap dipakai).`
              : `Terhubung ke Ollama (${models.length} model ditemukan). Pilih salah satu model di bawah agar sesuai.`
            : 'Ollama aktif, namun belum ada model terpasang. Jalankan "ollama pull llama3.2".',
      });
    } catch {
      setOllamaTest({
        status: 'error',
        message: 'Koneksi ke server aplikasi terputus saat menguji Ollama.',
      });
    }
  };

  const handleTestGemini = async () => {
    setGeminiTest({
      status: 'testing',
      message: `Menguji koneksi ${draft.gemini.textModel} via server...`,
    });
    try {
      const res = await fetch('/api/providers/gemini/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textModel: draft.gemini.textModel }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        model?: string;
        reply?: string;
        latencyMs?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setGeminiTest({
          status: 'error',
          message: data.error ?? 'Gagal menguji koneksi Gemini API.',
        });
        return;
      }
      setGeminiTest({
        status: 'ok',
        latencyMs: data.latencyMs,
        message: `Aktif (${data.model}): "${data.reply}"`,
      });
    } catch {
      setGeminiTest({
        status: 'error',
        message: 'Gagal menghubungi endpoint uji Gemini API.',
      });
    }
  };

  const handleGenerateEdgeTtsSample = async (e: FormEvent) => {
    e.preventDefault();
    setTtsError(null);
    setTtsAudioUrl(null);

    const voice = draft.edgeTts.voice;
    const text = ttsText.trim();
    if (text.length < 3 || text.length > 800) {
      setTtsError('Teks uji suara harus antara 3 hingga 800 karakter.');
      return;
    }

    setTtsLoading(true);
    onVoiceSynthesisEvent?.('start', `Tes suara Edge-TTS (${voice})`);
    try {
      const payload = buildEdgeTtsPayload(
        `edge-tts-test-${Date.now()}`,
        voice,
        draft.edgeTts.rate,
        draft.edgeTts.pitch,
        [{ role: 'narator', voice, text, pauseMs: 0 }]
      );
      const result = await generateEdgeTtsAudio(draft.edgeTts.workerUrl, payload);
      setTtsAudioUrl(result.dataUrl);
      onVoiceSynthesisEvent?.('done', `Tes suara Edge-TTS selesai (${result.characterCount ?? text.length} karakter)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Worker Edge-TTS tidak dapat dihubungi.';
      setTtsError(message);
      onVoiceSynthesisEvent?.('error', `Tes suara Edge-TTS gagal: ${message}`);
    } finally {
      setTtsLoading(false);
    }
  };

  const handleLoadElevenLabsVoices = async () => {
    setVoicesLoading(true);
    setVoicesError(null);
    try {
      const res = await fetch('/api/providers/elevenlabs/voices');
      const data = (await res.json()) as {
        voices?: ElevenLabsVoiceItem[];
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.voices)) {
        setVoicesError(data.error ?? 'Gagal memuat daftar suara ElevenLabs.');
        return;
      }
      setRemoteVoices(data.voices);
      if (data.voices.length > 0 && !data.voices.some((v) => v.voiceId === draft.elevenlabs.voiceId)) {
        setDraft((prev) => ({
          ...prev,
          elevenlabs: {
            ...prev.elevenlabs,
            voiceId: data.voices![0].voiceId,
            voiceName: data.voices![0].name,
          },
        }));
      }
    } catch {
      setVoicesError('Koneksi ke endpoint ElevenLabs terputus.');
    } finally {
      setVoicesLoading(false);
    }
  };

  const handleGenerateTtsSample = async (e: FormEvent) => {
    e.preventDefault();
    setTtsError(null);
    const check = validateElevenLabsTtsRequest({
      text: ttsText,
      voiceId: draft.elevenlabs.voiceId,
      modelId: draft.elevenlabs.modelId,
      stability: draft.elevenlabs.stability,
      similarityBoost: draft.elevenlabs.similarityBoost,
    });
    if (!check.ok) {
      setTtsError(check.error);
      return;
    }

    setTtsLoading(true);
    onVoiceSynthesisEvent?.('start', `Uji suara ElevenLabs (${draft.elevenlabs.voiceName})`);
    try {
      const res = await fetch('/api/providers/elevenlabs/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(check.value),
      });
      const data = (await res.json()) as { dataUrl?: string; error?: string };
      if (!res.ok || !data.dataUrl) {
        setTtsError(data.error ?? 'Gagal menghasilkan audio narasi ElevenLabs.');
        onVoiceSynthesisEvent?.('error', 'Gagal membuat audio ElevenLabs');
        return;
      }
      setTtsAudioUrl(data.dataUrl);
      onVoiceSynthesisEvent?.('done', `Audio ElevenLabs selesai (${check.value.text.length} karakter)`);
    } catch {
      setTtsError('Koneksi ke server TTS ElevenLabs terputus.');
      onVoiceSynthesisEvent?.('error', 'Koneksi ElevenLabs terputus');
    } finally {
      setTtsLoading(false);
    }
  };

  const routingOptions: Array<{ id: LlmRoutingMode; label: string; desc: string }> = [
    {
      id: 'auto',
      label: 'Otomatis (Ollama → Gemini)',
      desc: 'Coba Ollama lokal dulu, otomatis beralih ke Gemini jika offline',
    },
    {
      id: 'ollama',
      label: 'Hanya Ollama Lokal',
      desc: 'Seluruh 13 agen berjalan 100% di server Ollama localhost',
    },
    {
      id: 'gemini',
      label: 'Hanya Gemini Cloud',
      desc: 'Seluruh 13 agen langsung menggunakan Gemini API server',
    },
  ];

  return (
    <section
      aria-label="Pengaturan Koneksi AI: Ollama, Gemini API, dan ElevenLabs"
      className={`pointer-events-auto mb-2 w-full rounded-xl border shadow-2xl transition-colors duration-200 ${surfaceClass}`}
    >
      {/* Header */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2.5 ${subtleBorder}`}
      >
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold tracking-tight">
            Koneksi Provider AI · Ollama Localhost, Gemini API &amp; ElevenLabs
          </h2>
          <p className={`truncate text-[11px] ${mutedText}`}>
            Hubungkan 39 agen AI pada 3 lantai ke model lokal Ollama, 3 slot kunci Gemini API, dan narasi ElevenLabs
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {onOpenSetupGuide && (
            <button
              type="button"
              onClick={onOpenSetupGuide}
              data-testid="header-reopen-setup-guide-btn"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                isDark
                  ? 'border-sky-500/40 bg-sky-950/50 text-sky-200 hover:bg-sky-900/60 hover:text-white'
                  : 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 hover:text-sky-950'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Panduan Setup API
            </button>
          )}
          <button
            type="button"
            onClick={onOpenChannelTemplates}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
              isDark
                ? 'border-slate-700 bg-[#122038] text-slate-200 hover:bg-slate-800 hover:text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            Template 3 Channel
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan koneksi AI"
            className={`rounded-lg p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
              isDark
                ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Provider Tabs + Live Readiness Summary */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2 ${subtleBorder} ${tabBarBg}`}
      >
        <div
          className="flex flex-wrap items-center gap-1"
          role="tablist"
          aria-label="Pilih provider AI untuk dikonfigurasi"
        >
          {(
            [
              { id: 'ollama', label: 'Ollama (Localhost)', Icon: Cpu },
              { id: 'gemini', label: 'Gemini API', Icon: Sparkles },
              { id: 'elevenlabs', label: 'Suara & TTS', Icon: Volume2 },
              { id: 'firebase', label: 'Firebase Console', Icon: Cloud },
              { id: 'youtube', label: 'YouTube OAuth', Icon: Youtube },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                  active
                    ? isDark
                      ? 'bg-[#192942] text-white font-semibold'
                      : 'bg-white text-slate-950 font-semibold shadow-xs'
                    : isDark
                    ? 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-950'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>

        <div className={`flex items-center gap-2 text-[11px] ${mutedText}`}>
          <span>
            Routing:{' '}
            <strong className={isDark ? 'text-slate-200' : 'text-slate-800'}>
              {draft.llmRouting === 'auto'
                ? 'Otomatis'
                : draft.llmRouting === 'ollama'
                ? 'Ollama Lokal'
                : 'Gemini Cloud'}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Gemini:{' '}
            <strong
              className={
                serverStatus?.gemini.configured
                  ? 'text-emerald-500'
                  : isDark
                  ? 'text-amber-400'
                  : 'text-amber-700'
              }
            >
              {statusLoading ? 'Memeriksa...' : serverStatus?.gemini.configured ? 'Aktif' : 'Belum Diatur'}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            ElevenLabs:{' '}
            <strong
              className={
                serverStatus?.elevenlabs.configured
                  ? 'text-emerald-500'
                  : isDark
                  ? 'text-amber-400'
                  : 'text-amber-700'
              }
            >
              {statusLoading
                ? 'Memeriksa...'
                : serverStatus?.elevenlabs.configured
                ? 'Aktif'
                : 'Belum Diatur'}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => void fetchServerStatus()}
            aria-label="Muat ulang status koneksi server"
            title="Muat ulang status koneksi server"
            className={`rounded p-1 transition-colors ${
              isDark ? 'hover:bg-slate-800 hover:text-white' : 'hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${statusLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Tab Body */}
      <div className="max-h-[340px] overflow-y-auto p-3.5">
        {activeTab === 'ollama' && (
          <div className="space-y-3">
            {/* Agent Routing Mode Selector */}
            <div>
              <p className="text-xs font-semibold">Mode Routing untuk 13 Agen AI</p>
              <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {routingOptions.map((opt) => {
                  const selected = draft.llmRouting === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setDraft((prev) => ({
                          ...prev,
                          llmRouting: opt.id,
                          ollama:
                            opt.id === 'ollama'
                              ? { ...prev.ollama, enabled: true }
                              : prev.ollama,
                        }));
                        setSaveNotice(null);
                      }}
                      className={`rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                        selected
                          ? isDark
                            ? 'border-sky-400 bg-[#132540] text-white'
                            : 'border-slate-900 bg-slate-900 text-white'
                          : `${panelBg} hover:border-slate-400`
                      }`}
                    >
                      <div className="text-xs font-semibold">{opt.label}</div>
                      <p
                        className={`mt-0.5 text-[11px] leading-snug ${
                          selected ? 'opacity-85' : mutedText
                        }`}
                      >
                        {opt.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Endpoint + Model Configuration */}
            <div className={`grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-12 ${panelBg}`}>
              <div className="space-y-2.5 md:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor={ollamaUrlId} className="text-xs font-semibold">
                    URL Endpoint Ollama Localhost
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={draft.ollama.enabled}
                      onChange={(e) => {
                        setDraft((prev) => ({
                          ...prev,
                          ollama: { ...prev.ollama, enabled: e.target.checked },
                        }));
                        setSaveNotice(null);
                      }}
                      className="h-3.5 w-3.5 rounded accent-blue-600"
                    />
                    <span>Aktifkan Ollama</span>
                  </label>
                </div>

                <input
                  id={ollamaUrlId}
                  type="url"
                  value={draft.ollama.baseUrl}
                  onChange={(e) => {
                    setDraft((prev) => ({
                      ...prev,
                      ollama: { ...prev.ollama, baseUrl: e.target.value },
                    }));
                    setSaveNotice(null);
                  }}
                  placeholder="http://127.0.0.1:11434"
                  className={`w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs focus:border-blue-500 focus:outline-none ${inputSurface}`}
                />

                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={mutedText}>Preset cepat:</span>
                  {['http://127.0.0.1:11434', 'http://localhost:11434'].map((presetUrl) => (
                    <button
                      key={presetUrl}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          ollama: { ...prev.ollama, baseUrl: presetUrl },
                        }))
                      }
                      className="font-mono underline decoration-dotted underline-offset-2 hover:text-sky-400"
                    >
                      {presetUrl}
                    </button>
                  ))}
                </div>

                <div>
                  <span className="block text-xs font-semibold">Jalur Koneksi Ollama</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: 'proxy', label: 'Server Proxy (Aplikasi Lokal)' },
                        { id: 'browser', label: 'Langsung dari Browser (PC Lokal)' },
                      ] as Array<{ id: OllamaConnectionMode; label: string }>
                    ).map((modeOpt) => {
                      const active = draft.ollama.connectionMode === modeOpt.id;
                      return (
                        <button
                          key={modeOpt.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              ollama: { ...prev.ollama, connectionMode: modeOpt.id },
                            }))
                          }
                          className={`rounded-md border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                            active
                              ? isDark
                                ? 'border-sky-400 bg-sky-950/70 text-sky-200'
                                : 'border-slate-900 bg-slate-900 text-white'
                              : `${subtleBorder} ${mutedText} hover:text-current`
                          }`}
                        >
                          {modeOpt.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className={`mt-1 text-[11px] leading-snug ${mutedText}`}>
                    Jika membuka aplikasi dari URL cloud untuk menyambung ke Ollama di PC Anda, pilih{' '}
                    <strong>Langsung dari Browser</strong> dan jalankan{' '}
                    <code className="font-mono">OLLAMA_ORIGINS=&quot;*&quot; ollama serve</code>.
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 md:col-span-5">
                <div>
                  <label htmlFor={ollamaModelId} className="text-xs font-semibold">
                    Nama Model Ollama
                  </label>
                  <input
                    id={ollamaModelId}
                    type="text"
                    value={draft.ollama.model}
                    onChange={(e) => {
                      setDraft((prev) => ({
                        ...prev,
                        ollama: { ...prev.ollama, model: e.target.value },
                      }));
                      setSaveNotice(null);
                    }}
                    placeholder="llama3.2"
                    className={`mt-1 w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs focus:border-blue-500 focus:outline-none ${inputSurface}`}
                  />
                </div>

                <div>
                  <span className={`block text-[11px] ${mutedText}`}>
                    {discoveredModels.length > 0
                      ? 'Model terdeteksi dari Ollama Anda:'
                      : 'Pilihan model populer:'}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(discoveredModels.length > 0
                      ? discoveredModels.slice(0, 8).map((m) => ({ id: m, label: m }))
                      : OLLAMA_MODEL_PRESETS
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            ollama: { ...prev.ollama, model: m.id },
                          }))
                        }
                        className={`rounded border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                          draft.ollama.model === m.id
                            ? isDark
                              ? 'border-sky-400 bg-sky-950/70 text-sky-200'
                              : 'border-slate-900 bg-slate-900 text-white'
                            : `${subtleBorder} ${mutedText} hover:text-current`
                        }`}
                      >
                        {m.id}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleTestOllama()}
                  disabled={ollamaTest.status === 'testing'}
                  className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
                    isDark
                      ? 'bg-sky-600 text-white hover:bg-sky-500'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {ollamaTest.status === 'testing' ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Menguji Koneksi Ollama...
                    </>
                  ) : (
                    <>
                      <Server className="h-3.5 w-3.5" aria-hidden="true" />
                      Uji Koneksi &amp; Muat Daftar Model
                    </>
                  )}
                </button>
              </div>
            </div>

            {ollamaTest.status !== 'idle' && (
              <div
                role={ollamaTest.status === 'error' ? 'alert' : 'status'}
                className={`flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                  ollamaTest.status === 'ok'
                    ? isDark
                      ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-200'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-900'
                    : ollamaTest.status === 'error'
                    ? isDark
                      ? 'border-rose-500/40 bg-rose-950/50 text-rose-200'
                      : 'border-rose-300 bg-rose-50 text-rose-800'
                    : `${subtleBorder} ${mutedText}`
                }`}
              >
                <div className="flex items-start gap-2">
                  {ollamaTest.status === 'ok' ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : ollamaTest.status === 'error' ? (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                  )}
                  <span>{ollamaTest.message}</span>
                </div>
                {typeof ollamaTest.latencyMs === 'number' && (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums">
                    {ollamaTest.latencyMs} ms
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'gemini' && (
          <div className="space-y-3">
            {/* Server-Managed API Key Status Card (Zero browser API key inputs) */}
            <div className={`rounded-lg border p-3 ${panelBg}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      serverStatus?.gemini.configured ? 'text-emerald-500' : 'text-amber-500'
                    }`}
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="text-xs font-bold">
                      Autentikasi Gemini API · Dikelola Aman di Server
                    </h3>
                    <p className={`mt-0.5 text-[11px] leading-relaxed ${mutedText}`}>
                      Status server:{' '}
                      <strong
                        className={
                          serverStatus?.gemini.configured
                            ? 'text-emerald-500'
                            : isDark
                            ? 'text-amber-400'
                            : 'text-amber-700'
                        }
                      >
                        {statusLoading
                          ? 'Memeriksa...'
                          : serverStatus?.gemini.configured
                          ? 'Terhubung (GEMINI_API_KEY aktif di server)'
                          : 'Belum terdeteksi di variabel lingkungan server'}
                      </strong>
                      . Untuk mengganti atau menambahkan kunci API Gemini, atur variabel{' '}
                      <code className="font-mono">GEMINI_API_KEY</code> di{' '}
                      <strong>Dashboard Netlify &gt; Site configuration &gt; Environment variables</strong>{' '}
                      (untuk <code className="font-mono">officecontent.netlify.app</code>) atau{' '}
                      <strong>Settings &gt; Secrets</strong> di AI Studio — kunci tetap aman di sisi server.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleTestGemini()}
                    disabled={geminiTest.status === 'testing'}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-60 ${
                      isDark
                        ? 'bg-sky-600 text-white hover:bg-sky-500'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {geminiTest.status === 'testing' ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        Menguji...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        Uji Koneksi Gemini
                      </>
                    )}
                  </button>

                  {onOpenSetupGuide && (
                    <button
                      type="button"
                      data-testid="reopen-setup-guide-btn"
                      onClick={onOpenSetupGuide}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                        isDark
                          ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                          : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                      Panduan Setup API &amp; Firebase
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 3-Floor Dedicated API Key Routing Matrix (Read-Only Server Status) */}
            <div className={`rounded-lg border p-3 ${panelBg}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold">Perutean 3 Kunci API per Lantai &amp; Channel YouTube</h3>
                <span className={`font-mono text-[10px] ${mutedText}`}>
                  Netlify Env / AI Studio Secrets
                </span>
              </div>
              <p className={`mt-1 text-[11px] leading-relaxed ${mutedText}`}>
                Setiap lantai (13 agen AI) otomatis memakai 1 kunci API Gemini &amp; ElevenLabs khusus
                channel lantai tersebut untuk seluruh perintah di lantai itu. Jika slot khusus lantai
                kosong, server otomatis memakai kunci global.
              </p>
              <div className={`mt-2 divide-y rounded-md border text-[11px] ${subtleBorder}`}>
                {(serverStatus?.channelRouting ?? []).map((slot) => (
                  <div
                    key={slot.channelId}
                    className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {slot.floorLabel ? `${slot.floorLabel} · ` : ''}
                        {slot.channelLabel}
                      </p>
                      <p className={`truncate font-mono text-[10px] ${mutedText}`}>
                        {slot.geminiEnvVar} · {slot.elevenLabsEnvVar}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-medium">
                      <span
                        className={
                          slot.geminiSource === 'dedicated'
                            ? 'text-emerald-500'
                            : slot.geminiSource === 'fallback_global'
                            ? isDark
                              ? 'text-sky-400'
                              : 'text-sky-700'
                            : 'text-amber-500'
                        }
                      >
                        Gemini:{' '}
                        {slot.geminiSource === 'dedicated'
                          ? 'Kunci Khusus'
                          : slot.geminiSource === 'fallback_global'
                          ? 'Fallback Global'
                          : 'Belum Aktif'}
                      </span>
                      <span aria-hidden="true" className={mutedText}>
                        ·
                      </span>
                      <span
                        className={
                          slot.elevenLabsSource === 'dedicated'
                            ? 'text-emerald-500'
                            : slot.elevenLabsSource === 'fallback_global'
                            ? isDark
                              ? 'text-sky-400'
                              : 'text-sky-700'
                            : mutedText
                        }
                      >
                        Audio:{' '}
                        {slot.elevenLabsSource === 'dedicated'
                          ? 'Kunci Khusus'
                          : slot.elevenLabsSource === 'fallback_global'
                          ? 'Fallback Global'
                          : 'Opsional'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Gemini Model Choice */}
            <div>
              <p className="text-xs font-semibold">Model Teks Gemini untuk 13 Agen AI</p>
              <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {GEMINI_TEXT_MODELS.map((m) => {
                  const selected = draft.gemini.textModel === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setDraft((prev) => ({
                          ...prev,
                          gemini: { textModel: m.id as GeminiTextModelId },
                        }));
                        setSaveNotice(null);
                      }}
                      className={`rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                        selected
                          ? isDark
                            ? 'border-sky-400 bg-[#132540] text-white'
                            : 'border-slate-900 bg-slate-900 text-white'
                          : `${panelBg} hover:border-slate-400`
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold">{m.label}</span>
                        <span className="font-mono text-[10px] opacity-80">{m.id}</span>
                      </div>
                      <p className={`mt-1 text-[11px] ${selected ? 'opacity-85' : mutedText}`}>
                        {m.note}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {geminiTest.status !== 'idle' && (
              <div
                role={geminiTest.status === 'error' ? 'alert' : 'status'}
                className={`flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                  geminiTest.status === 'ok'
                    ? isDark
                      ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-200'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-900'
                    : geminiTest.status === 'error'
                    ? isDark
                      ? 'border-rose-500/40 bg-rose-950/50 text-rose-200'
                      : 'border-rose-300 bg-rose-50 text-rose-800'
                    : `${subtleBorder} ${mutedText}`
                }`}
              >
                <div className="flex items-start gap-2">
                  {geminiTest.status === 'ok' ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : geminiTest.status === 'error' ? (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                  )}
                  <span>{geminiTest.message}</span>
                </div>
                {typeof geminiTest.latencyMs === 'number' && (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums">
                    {geminiTest.latencyMs} ms
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'elevenlabs' && (
          <div className="space-y-3">
            <div className={`rounded-lg border p-3 ${panelBg}`}>
              <label className="text-xs font-semibold" htmlFor="voice-provider-choice">Provider Suara</label>
              <select
                id="voice-provider-choice"
                value={draft.voiceProvider}
                onChange={(e) => {
                  setDraft((prev) => ({
                    ...prev,
                    voiceProvider: e.target.value === 'edge-tts' ? 'edge-tts' : 'elevenlabs',
                  }));
                  setTtsError(null);
                  setTtsAudioUrl(null);
                  setSaveNotice(null);
                }}
                className={`mt-1 w-full rounded-lg border px-2.5 py-2 text-xs ${inputSurface}`}
              >
                <option value="edge-tts">Edge-TTS (Gratis via Windows Worker)</option>
                <option value="elevenlabs">ElevenLabs (API Berbayar)</option>
              </select>
              <p className={`mt-1.5 text-[11px] ${mutedText}`}>
                Pilih salah satu provider untuk membuat audio narasi. Konfigurasi ElevenLabs tetap tersimpan meskipun Edge-TTS sedang dipilih.
              </p>
            </div>

            {draft.voiceProvider === 'edge-tts' && (
              <div className={`space-y-3 rounded-lg border p-3 ${panelBg}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold">Edge-TTS · Windows Production Worker</h3>
                    <p className={`mt-0.5 text-[11px] ${mutedText}`}>Sintesis narasi melalui Worker Windows dengan Firebase ID Token.</p>
                  </div>
                  <span className="rounded-full border border-emerald-500/40 px-2 py-1 text-[10px] font-semibold text-emerald-500">Tanpa API key ElevenLabs</span>
                </div>

                <div>
                  <label htmlFor="edge-tts-worker-url" className="text-xs font-semibold">URL Windows Production Worker</label>
                  <input
                    id="edge-tts-worker-url"
                    type="url"
                    value={draft.edgeTts.workerUrl}
                    onChange={(e) => {
                      setDraft((prev) => ({ ...prev, edgeTts: { ...prev.edgeTts, workerUrl: e.target.value } }));
                      setSaveNotice(null);
                    }}
                    placeholder="http://127.0.0.1:8765"
                    className={`mt-1 w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs ${inputSurface}`}
                  />
                  <p className={`mt-1 text-[10px] ${mutedText}`}>Alamat localhost hanya dapat dipakai saat browser dan Worker berada di PC yang sama. URL remote wajib HTTPS.</p>
                </div>

                <div>
                  <label htmlFor="edge-tts-voice" className="text-xs font-semibold">Suara Narator Default</label>
                  <select
                    id="edge-tts-voice"
                    value={draft.edgeTts.voice}
                    onChange={(e) => {
                      setDraft((prev) => ({ ...prev, edgeTts: { ...prev.edgeTts, voice: e.target.value as ProviderConfig['edgeTts']['voice'] } }));
                      setSaveNotice(null);
                    }}
                    className={`mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs ${inputSurface}`}
                  >
                    {EDGE_TTS_VOICE_PRESETS.map((voice) => (
                      <option key={voice.id} value={voice.id}>{voice.label} · {voice.id}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="edge-tts-rate" className="text-xs font-semibold">Kecepatan / Rate</label>
                      <span className="font-mono text-xs">{draft.edgeTts.rate}</span>
                    </div>
                    <input
                      id="edge-tts-rate"
                      type="range"
                      min={-30}
                      max={30}
                      step={1}
                      value={Number(draft.edgeTts.rate.replace('%', ''))}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setDraft((prev) => ({ ...prev, edgeTts: { ...prev.edgeTts, rate: value > 0 ? `+${value}%` : `${value}%` } }));
                        setSaveNotice(null);
                      }}
                      className="mt-2 w-full accent-blue-600"
                    />
                    <p className={`text-[10px] ${mutedText}`}>Rentang -30% sampai +30%. Default -5% untuk tempo dongeng.</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="edge-tts-pitch" className="text-xs font-semibold">Nada / Pitch</label>
                      <span className="font-mono text-xs">{draft.edgeTts.pitch}</span>
                    </div>
                    <input
                      id="edge-tts-pitch"
                      type="range"
                      min={-20}
                      max={20}
                      step={1}
                      value={Number(draft.edgeTts.pitch.replace('Hz', ''))}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setDraft((prev) => ({ ...prev, edgeTts: { ...prev.edgeTts, pitch: value > 0 ? `+${value}Hz` : `${value}Hz` } }));
                        setSaveNotice(null);
                      }}
                      className="mt-2 w-full accent-blue-600"
                    />
                    <p className={`text-[10px] ${mutedText}`}>Rentang -20Hz sampai +20Hz.</p>
                  </div>
                </div>

                <form onSubmit={(e) => void handleGenerateEdgeTtsSample(e)} className="space-y-2.5 rounded-lg border p-3">
                  <label htmlFor={ttsInputId} className="text-xs font-semibold">Tes Suara Narator</label>
                  <textarea
                    id={ttsInputId}
                    rows={3}
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                    className={`mt-1 w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed ${inputSurface}`}
                  />
                  {ttsError && <p role="alert" className="text-[11px] text-rose-500">{ttsError}</p>}
                  {ttsAudioUrl && (
                    <div className="flex flex-wrap items-center gap-2">
                      <audio controls src={ttsAudioUrl} className="h-8 min-w-0 flex-1" />
                      <a href={ttsAudioUrl} download="tes-suara-edge-tts.mp3" className={`rounded-md border px-2 py-1 text-[11px] ${subtleBorder}`}>Unduh MP3</a>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={ttsLoading}
                    className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60 ${isDark ? 'bg-sky-600 text-white' : 'bg-slate-900 text-white'}`}
                  >
                    {ttsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
                    {ttsLoading ? 'Membuat audio...' : 'Tes Suara Narator'}
                  </button>
                </form>
              </div>
            )}

            {draft.voiceProvider === 'elevenlabs' && (
              <>

            {/* ElevenLabs Server Key Readiness Banner (Zero browser API key input) */}
            <div className={`rounded-lg border p-3 ${panelBg}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <Volume2
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      serverStatus?.elevenlabs.configured ? 'text-emerald-500' : 'text-amber-500'
                    }`}
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="text-xs font-bold">
                      ElevenLabs TTS · Agen Voice Artist (Sora Permata)
                    </h3>
                    <p className={`mt-0.5 text-[11px] leading-relaxed ${mutedText}`}>
                      Status server:{' '}
                      <strong
                        className={
                          serverStatus?.elevenlabs.configured
                            ? 'text-emerald-500'
                            : isDark
                            ? 'text-amber-400'
                            : 'text-amber-700'
                        }
                      >
                        {statusLoading
                          ? 'Memeriksa...'
                          : serverStatus?.elevenlabs.configured
                          ? 'Terhubung (ELEVENLABS_API_KEY aktif di server)'
                          : 'ELEVENLABS_API_KEY belum dipasang di Settings > Secrets'}
                      </strong>
                      . Tambahkan variabel <code className="font-mono">ELEVENLABS_API_KEY</code> di{' '}
                      <strong>Settings &gt; Secrets</strong> agar server dapat mensintesis suara MP3 secara aman.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleLoadElevenLabsVoices()}
                  disabled={voicesLoading}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-60 ${
                    isDark
                      ? 'border-slate-700 bg-[#122038] text-slate-200 hover:bg-slate-800'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {voicesLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Muat Daftar Suara
                </button>
              </div>
              {voicesError && (
                <p role="alert" className="mt-2 flex items-center gap-1.5 text-[11px] text-rose-500">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {voicesError}
                </p>
              )}
            </div>

            {/* Voice & Model Settings + Live TTS Tester */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className={`space-y-2.5 rounded-lg border p-3 md:col-span-6 ${panelBg}`}>
                <div>
                  <label htmlFor={elevenVoiceIdInput} className="text-xs font-semibold">
                    Voice ID ElevenLabs
                  </label>
                  <input
                    id={elevenVoiceIdInput}
                    type="text"
                    value={draft.elevenlabs.voiceId}
                    onChange={(e) => {
                      setDraft((prev) => ({
                        ...prev,
                        elevenlabs: { ...prev.elevenlabs, voiceId: e.target.value },
                      }));
                      setSaveNotice(null);
                    }}
                    placeholder="21m00Tcm4TlvDq8ikWAM"
                    className={`mt-1 w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs focus:border-blue-500 focus:outline-none ${inputSurface}`}
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(remoteVoices.length > 0 ? remoteVoices.slice(0, 6) : ELEVENLABS_VOICE_PRESETS).map(
                      (v) => (
                        <button
                          key={v.voiceId}
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              elevenlabs: {
                                ...prev.elevenlabs,
                                voiceId: v.voiceId,
                                voiceName: v.name,
                              },
                            }))
                          }
                          className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
                            draft.elevenlabs.voiceId === v.voiceId
                              ? isDark
                                ? 'border-sky-400 bg-sky-950/70 text-sky-200'
                                : 'border-slate-900 bg-slate-900 text-white'
                              : `${subtleBorder} ${mutedText} hover:text-current`
                          }`}
                        >
                          {v.name}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor={elevenModelSelectId} className="text-xs font-semibold">
                    Model Suara
                  </label>
                  <select
                    id={elevenModelSelectId}
                    value={draft.elevenlabs.modelId}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        elevenlabs: {
                          ...prev.elevenlabs,
                          modelId: e.target.value as ElevenLabsModelId,
                        },
                      }))
                    }
                    className={`mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs ${inputSurface}`}
                  >
                    {ELEVENLABS_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} — {m.note}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-0.5">
                  <div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium">Stabilitas</span>
                      <span className="font-mono tabular-nums">
                        {Math.round(draft.elevenlabs.stability * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label="Stabilitas suara ElevenLabs"
                      min={0}
                      max={1}
                      step={0.05}
                      value={draft.elevenlabs.stability}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          elevenlabs: {
                            ...prev.elevenlabs,
                            stability: Number(e.target.value),
                          },
                        }))
                      }
                      className="mt-1 w-full accent-blue-600"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium">Kemiripan</span>
                      <span className="font-mono tabular-nums">
                        {Math.round(draft.elevenlabs.similarityBoost * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label="Kemiripan suara ElevenLabs"
                      min={0}
                      max={1}
                      step={0.05}
                      value={draft.elevenlabs.similarityBoost}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          elevenlabs: {
                            ...prev.elevenlabs,
                            similarityBoost: Number(e.target.value),
                          },
                        }))
                      }
                      className="mt-1 w-full accent-blue-600"
                    />
                  </div>
                </div>
              </div>

              <form
                onSubmit={(e) => void handleGenerateTtsSample(e)}
                className={`flex flex-col justify-between space-y-2.5 rounded-lg border p-3 md:col-span-6 ${panelBg}`}
              >
                <div>
                  <label htmlFor={ttsInputId} className="text-xs font-semibold">
                    Uji Narasi Suara (Sora Permata · Voice Artist)
                  </label>
                  <textarea
                    id={ttsInputId}
                    rows={3}
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                    placeholder="Tulis kalimat pendek Bahasa Indonesia untuk menguji suara ElevenLabs..."
                    className={`mt-1 w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed focus:border-blue-500 focus:outline-none ${inputSurface}`}
                  />
                </div>

                {ttsError && (
                  <p role="alert" className="flex items-start gap-1.5 text-[11px] text-rose-500">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{ttsError}</span>
                  </p>
                )}

                {ttsAudioUrl && (
                  <div className="flex items-center gap-2">
                    <audio controls src={ttsAudioUrl} className="h-8 flex-1" />
                    <a
                      href={ttsAudioUrl}
                      download="narasi-elevenlabs-shorts.mp3"
                      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${subtleBorder}`}
                    >
                      <Download className="h-3 w-3" aria-hidden="true" />
                      MP3
                    </a>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={ttsLoading}
                  className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
                    isDark
                      ? 'bg-sky-600 text-white hover:bg-sky-500'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {ttsLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Mensintesis Suara MP3...
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Buat Pratinjau Narasi ElevenLabs
                    </>
                  )}
                </button>
              </form>
            </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'firebase' && (
          <div className="space-y-3">
            <div className={`rounded-lg border p-3 ${panelBg}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                  <div>
                    <h3 className="text-xs font-bold">
                      Firebase Console · Proyek {firebaseConfig.projectId}
                    </h3>
                    <p className={`mt-0.5 text-[11px] leading-relaxed ${mutedText}`}>
                      Auth Domain:{' '}
                      <code className="font-mono">{firebaseConfig.authDomain}</code> · Status:{' '}
                      <strong
                        className={
                          firebaseUser
                            ? 'text-emerald-500'
                            : isDark
                            ? 'text-amber-400'
                            : 'text-amber-700'
                        }
                      >
                        {firebaseUser
                          ? `Masuk sebagai ${firebaseUser.email || firebaseUser.displayName}`
                          : 'Belum masuk (Mode Pratinjau aktif)'}
                      </strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onOpenFirebaseAuth}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                    isDark
                      ? 'bg-sky-600 text-white hover:bg-sky-500'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                  {firebaseUser ? 'Kelola Akun & Sync' : 'Buka Login Firebase'}
                </button>
              </div>
            </div>

            <div className={`grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-2 ${panelBg}`}>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <Database className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
                  <span>Koleksi Firestore Kantor AI 3D</span>
                </div>
                <ul className={`space-y-1 font-mono text-[11px] ${mutedText}`}>
                  <li>users/&#123;uid&#125;</li>
                  <li>users/&#123;uid&#125;/workspace/settings</li>
                  <li>users/&#123;uid&#125;/shortsQueue/&#123;itemId&#125;</li>
                  <li>users/&#123;uid&#125;/agentTasks/&#123;taskId&#125;</li>
                </ul>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold">Status Koneksi &amp; Firestore Rules</p>
                <p className={`text-[11px] leading-relaxed ${mutedText}`}>
                  {firebaseSyncStatus.message}
                </p>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'youtube' && (
          <YoutubeSettingsPanel lighting={lighting} signedIn={Boolean(firebaseUser)} />
        )}
      </div>

      {/* Footer Save / Reset Bar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-t px-3.5 py-2.5 ${subtleBorder}`}
      >
        <div className="min-w-0 flex-1 text-xs">
          {validationError ? (
            <span role="alert" className="inline-flex items-center gap-1.5 font-medium text-rose-500">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {validationError}
            </span>
          ) : saveNotice ? (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 font-medium text-emerald-500"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {saveNotice}
            </span>
          ) : (
            <span className={`text-[11px] ${mutedText}`}>
              Perubahan disimpan lokal dan langsung dipakai saat menugaskan 13 agen AI.
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onResetConfig();
              setValidationError(null);
              setSaveNotice('Pengaturan koneksi dikembalikan ke setelan awal.');
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              isDark
                ? 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset Default
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              isDark
                ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            Simpan Konfigurasi
          </button>
        </div>
      </div>
    </section>
  );
}
