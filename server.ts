import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { validateImageRequest, validateVideoRequest } from './src/office/mediaStudio.ts';
import {
  canMarkReadyToPublish,
  computeScriptWordBudget,
  enforceThreeSentenceCap,
  extractIndonesianBibleReferences,
  formatTemplatePromptDirectives,
  getChannelById,
  validateShortsBrief,
  type CareFlag,
  type GuardianReport,
  type GuardianVerdict,
  type PastoralReport,
  type ShortsChannelId,
  type ShortsDuration,
} from './src/office/shortsFactory.ts';
import { getSpecialistById } from './src/office/agentRoster.ts';
import {
  mergeProviderConfig,
  normalizeOllamaBaseUrl,
  resolveLlmExecutionOrder,
  validateElevenLabsTtsRequest,
  type GeminiTextModelId,
} from './src/office/providerConfig.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi pada server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function mapGeminiApiError(err: unknown, fallbackLabel: string): { statusCode: number; message: string } {
  const rawMessage = err instanceof Error ? err.message : fallbackLabel;
  if (rawMessage.includes('GEMINI_API_KEY')) {
    return {
      statusCode: 503,
      message: 'Kunci API Gemini belum terpasang pada pengaturan server (Settings > Secrets).',
    };
  }
  if (/503|UNAVAILABLE|high demand/i.test(rawMessage)) {
    return {
      statusCode: 503,
      message: 'Server model AI sedang padat sementara. Silakan coba lagi beberapa saat lagi.',
    };
  }
  if (/429|RESOURCE_EXHAUSTED|quota|billing/i.test(rawMessage)) {
    return {
      statusCode: 429,
      message:
        'Batas kuota tercapai atau model ini memerlukan kunci API berbayar di Settings > Secrets.',
    };
  }
  if (/403|PERMISSION_DENIED|API_KEY_INVALID/i.test(rawMessage)) {
    return {
      statusCode: 403,
      message:
        'Akses ditolak. Pastikan kunci API Gemini berbayar telah dikonfigurasi di Settings > Secrets.',
    };
  }
  if (rawMessage.trim().startsWith('{')) {
    return {
      statusCode: 500,
      message: fallbackLabel,
    };
  }
  return { statusCode: 500, message: rawMessage };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  function isGeminiKeyConfigured(): boolean {
    const k = process.env.GEMINI_API_KEY;
    return Boolean(k && k.trim() && k !== 'MY_GEMINI_API_KEY');
  }

  function isElevenLabsKeyConfigured(): boolean {
    const k = process.env.ELEVENLABS_API_KEY;
    return Boolean(k && k.trim() && k !== 'MY_ELEVENLABS_API_KEY');
  }

  async function callOllamaChat(params: {
    baseUrl: string;
    model: string;
    systemInstruction: string;
    userPrompt: string;
    timeoutMs?: number;
  }): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 25000);
    try {
      const response = await fetch(`${params.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: params.model,
          stream: false,
          messages: [
            { role: 'system', content: params.systemInstruction },
            { role: 'user', content: params.userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(
          `Ollama HTTP ${response.status}: ${bodyText.slice(0, 140) || response.statusText}`
        );
      }

      const data = (await response.json()) as {
        message?: { content?: string };
        response?: string;
      };
      const text = (data.message?.content ?? data.response ?? '').trim();
      if (!text) {
        throw new Error('Ollama tidak mengembalikan teks jawaban.');
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  app.get('/api/providers/status', (_req, res) => {
    const defaultGeminiModel: GeminiTextModelId = 'gemini-4-hydrogen';
    res.json({
      gemini: {
        configured: isGeminiKeyConfigured(),
        defaultModel: defaultGeminiModel,
      },
      elevenlabs: {
        configured: isElevenLabsKeyConfigured(),
        defaultVoiceId: process.env.ELEVENLABS_VOICE_ID?.trim() || '21m00Tcm4TlvDq8ikWAM',
        defaultModelId: process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_multilingual_v2',
      },
      ollama: {
        defaultBaseUrl: process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434',
        defaultModel: process.env.OLLAMA_MODEL?.trim() || 'llama3.2',
      },
    });
  });

  app.post('/api/providers/ollama/test', async (req, res) => {
    const body = req.body as { baseUrl?: string; model?: string } | undefined;
    const urlCheck = normalizeOllamaBaseUrl(
      typeof body?.baseUrl === 'string'
        ? body.baseUrl
        : process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
    );
    if (!urlCheck.ok) {
      res.status(400).json({ error: urlCheck.error });
      return;
    }
    const targetModel = typeof body?.model === 'string' ? body.model.trim() : '';
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${urlCheck.url}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        res.status(502).json({
          error: `Server Ollama merespons HTTP ${response.status}. Pastikan layanan Ollama aktif.`,
        });
        return;
      }

      const data = (await response.json()) as {
        models?: Array<{ name?: string; model?: string }>;
      };
      const models = Array.isArray(data.models)
        ? data.models
            .map((m) => String(m.name ?? m.model ?? '').trim())
            .filter(Boolean)
        : [];
      const hasSelectedModel = targetModel
        ? models.some((m) => m === targetModel || m.startsWith(`${targetModel}:`))
        : models.length > 0;

      res.json({
        ok: true,
        baseUrl: urlCheck.url,
        models,
        hasSelectedModel,
        latencyMs,
      });
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      res.status(503).json({
        error: isAbort
          ? `Timeout menghubungi ${urlCheck.url}. Jika aplikasi dibuka dari cloud, jalankan di PC lokal atau pilih mode "Langsung dari Browser (PC Lokal)" dengan OLLAMA_ORIGINS="*".`
          : `Tidak dapat menjangkau Ollama di ${urlCheck.url} dari server ini. Pastikan "ollama serve" berjalan, atau gunakan mode "Langsung dari Browser (PC Lokal)" / URL tunnel.`,
      });
    } finally {
      clearTimeout(timer);
    }
  });

  app.post('/api/providers/gemini/test', async (req, res) => {
    const body = req.body as { textModel?: string } | undefined;
    const requestedModel: GeminiTextModelId =
      body?.textModel === 'gemini-3.1-flash-lite'
        ? 'gemini-3.1-flash-lite'
        : 'gemini-4-hydrogen';

    const startedAt = Date.now();
    try {
      const ai = createGeminiClient();
      const response = await ai.models.generateContent({
        model: requestedModel,
        contents: 'Balas dengan satu kalimat singkat berbahasa Indonesia: Koneksi Gemini Kantor AI 3D siap digunakan.',
        config:
          requestedModel === 'gemini-4-hydrogen'
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : undefined,
      });
      const reply = (response.text ?? '').trim();
      res.json({
        ok: true,
        model: requestedModel,
        reply: reply || 'Koneksi Gemini aktif.',
        latencyMs: Date.now() - startedAt,
      });
    } catch (err) {
      const mapped = mapGeminiApiError(
        err,
        'Gagal menguji koneksi Gemini API. Periksa GEMINI_API_KEY di Settings > Secrets.'
      );
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  app.get('/api/providers/elevenlabs/voices', async (_req, res) => {
    if (!isElevenLabsKeyConfigured()) {
      res.status(503).json({
        error:
          'ELEVENLABS_API_KEY belum terpasang di server. Tambahkan kunci ElevenLabs pada panel Settings > Secrets lalu mulai ulang server.',
      });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        method: 'GET',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY!,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const statusCode = response.status === 401 ? 401 : 502;
        res.status(statusCode).json({
          error:
            response.status === 401
              ? 'Kunci ELEVENLABS_API_KEY tidak valid. Periksa kembali di Settings > Secrets.'
              : `Gagal mengambil daftar suara ElevenLabs (HTTP ${response.status}).`,
        });
        return;
      }

      const data = (await response.json()) as {
        voices?: Array<{
          voice_id?: string;
          name?: string;
          category?: string;
          labels?: { accent?: string };
        }>;
      };
      const voices = Array.isArray(data.voices)
        ? data.voices
            .filter((v) => v.voice_id && v.name)
            .slice(0, 40)
            .map((v) => ({
              voiceId: String(v.voice_id),
              name: String(v.name),
              category: String(v.category ?? 'premade'),
              accent: String(v.labels?.accent ?? ''),
            }))
        : [];
      res.json({ voices });
    } catch {
      res.status(503).json({
        error: 'Koneksi ke API ElevenLabs gagal atau timeout.',
      });
    } finally {
      clearTimeout(timer);
    }
  });

  app.post('/api/providers/elevenlabs/tts', async (req, res) => {
    if (!isElevenLabsKeyConfigured()) {
      res.status(503).json({
        error:
          'ELEVENLABS_API_KEY belum terpasang di server. Tambahkan kunci ElevenLabs pada panel Settings > Secrets untuk menghasilkan narasi suara.',
      });
      return;
    }

    const validated = validateElevenLabsTtsRequest(req.body ?? {});
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const { text, voiceId, modelId, stability, similarityBoost } = validated.value;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY!,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: {
              stability,
              similarity_boost: similarityBoost,
            },
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const statusCode = response.status === 401 ? 401 : response.status === 429 ? 429 : 502;
        res.status(statusCode).json({
          error:
            response.status === 401
              ? 'Kunci ELEVENLABS_API_KEY ditolak oleh ElevenLabs. Periksa di Settings > Secrets.'
              : response.status === 429
              ? 'Kuota karakter ElevenLabs habis atau batas permintaan tercapai.'
              : `ElevenLabs TTS gagal (HTTP ${response.status}). Pastikan Voice ID valid.`,
        });
        return;
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      res.json({
        dataUrl: `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`,
        mimeType: 'audio/mpeg',
        voiceId,
        modelId,
        charCount: text.length,
        createdAt: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        error: 'Gagal menghubungi server ElevenLabs untuk sintesis audio.',
      });
    } finally {
      clearTimeout(timer);
    }
  });

  app.post('/api/agent-task', async (req, res) => {
    const body = req.body as
      | {
          agentId?: string;
          specialistId?: string;
          task?: string;
          providerConfig?: unknown;
        }
      | undefined;
    const agentId = typeof body?.agentId === 'string' ? body.agentId.trim().toLowerCase() : '';
    const specialistId =
      typeof body?.specialistId === 'string' ? body.specialistId.trim().toLowerCase() : '';
    const task = typeof body?.task === 'string' ? body.task.trim() : '';

    const resolvedId = specialistId || agentId;
    const specialist = resolvedId ? getSpecialistById(resolvedId) : undefined;

    if (!specialist) {
      res.status(400).json({ error: 'Agen AI yang dipilih tidak valid.' });
      return;
    }

    if (task.length < 3) {
      res.status(400).json({ error: 'Tuliskan instruksi tugas minimal 3 karakter.' });
      return;
    }

    if (task.length > 600) {
      res.status(400).json({ error: 'Instruksi tugas maksimal 600 karakter.' });
      return;
    }

    const persona = {
      name: specialist.personName,
      role: `${specialist.roleTitle} (${specialist.jobTitleId})`,
      specialty: `${specialist.summary}. Tanggung jawab: ${specialist.responsibilities.join(' ')}`,
    };

    const systemInstruction =
      `Kamu adalah ${persona.name}, menjabat sebagai ${persona.role} di studio produksi YouTube Shorts Kantor AI 3D. ` +
      `Fokus kerjamu: ${persona.specialty} ` +
      `Jawab langsung dalam Bahasa Indonesia yang ringkas, terstruktur, dan siap eksekusi (maksimal 120 kata, gunakan 3-4 poin konkret tanpa basa-basi pembuka yang panjang).`;
    const userPrompt = `Tugas dari pimpinan kantor untuk ${persona.name} — ${persona.role}:\n${task}`;

    const providerCfg = mergeProviderConfig(body?.providerConfig);
    const executionOrder = resolveLlmExecutionOrder(providerCfg);
    let lastError: unknown = null;

    for (const step of executionOrder) {
      if (step === 'ollama') {
        try {
          const ollamaOutput = await callOllamaChat({
            baseUrl: providerCfg.ollama.baseUrl,
            model: providerCfg.ollama.model,
            systemInstruction,
            userPrompt,
          });
          res.json({
            agentId: specialist.id,
            agentName: persona.name,
            output: ollamaOutput,
            providerUsed: 'ollama',
            modelUsed: providerCfg.ollama.model,
            completedAt: new Date().toISOString(),
          });
          return;
        } catch (ollamaErr) {
          lastError = ollamaErr;
          // Continue to Gemini fallback when llmRouting === 'auto'
          if (providerCfg.llmRouting === 'ollama') {
            res.status(503).json({
              error: `Ollama lokal (${providerCfg.ollama.baseUrl}) tidak dapat dijangkau: ${
                ollamaErr instanceof Error ? ollamaErr.message : 'Koneksi gagal'
              }. Jalankan "ollama serve" atau ubah routing ke Otomatis / Gemini.`,
            });
            return;
          }
        }
      } else {
        try {
          const ai = createGeminiClient();
          const preferred = providerCfg.gemini.textModel;
          const modelsToTry: GeminiTextModelId[] =
            preferred === 'gemini-3.1-flash-lite'
              ? ['gemini-3.1-flash-lite', 'gemini-4-hydrogen']
              : ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
          let output = '';
          let usedModel: string = preferred;

          for (const modelName of modelsToTry) {
            try {
              const response = await ai.models.generateContent({
                model: modelName,
                contents: userPrompt,
                config: {
                  systemInstruction,
                  ...(modelName === 'gemini-4-hydrogen'
                    ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                    : {}),
                },
              });
              output = (response.text ?? '').trim();
              if (output) {
                usedModel = modelName;
                break;
              }
            } catch (modelErr) {
              lastError = modelErr;
              const errStr = modelErr instanceof Error ? modelErr.message : String(modelErr);
              const isTransient = /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|high demand/i.test(
                errStr
              );
              if (!isTransient) throw modelErr;
            }
          }

          if (!output) {
            if (lastError) throw lastError;
            res.status(502).json({ error: 'Model tidak mengembalikan hasil untuk tugas ini.' });
            return;
          }

          res.json({
            agentId: specialist.id,
            agentName: persona.name,
            output,
            providerUsed:
              executionOrder.length > 1 && executionOrder[0] === 'ollama'
                ? 'gemini (fallback)'
                : 'gemini',
            modelUsed: usedModel,
            completedAt: new Date().toISOString(),
          });
          return;
        } catch (err) {
          lastError = err;
        }
      }
    }

    const mapped = mapGeminiApiError(
      lastError,
      'Terjadi kesalahan saat memproses tugas agen AI.'
    );
    res.status(mapped.statusCode).json({ error: mapped.message });
  });

  app.post('/api/studio/video', async (req, res) => {
    const validated = validateVideoRequest(req.body ?? {});
    if (!validated.ok || !validated.value) {
      res.status(400).json({ error: validated.error ?? 'Permintaan video tidak valid.' });
      return;
    }

    const { prompt, aspectRatio, duration } = validated.value;

    try {
      const ai = createGeminiClient();
      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: prompt,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: aspectRatio,
            duration,
            resolution: '720p',
          },
        },
        { timeout: 300000 }
      );

      let videoData: string | undefined;
      let mimeType = 'video/mp4';

      const directVideo = interaction.output_video as
        | { data?: string; mime_type?: string }
        | null
        | undefined;
      if (directVideo?.data) {
        videoData = directVideo.data;
        if (directVideo.mime_type) mimeType = directVideo.mime_type;
      } else if (Array.isArray(interaction.steps)) {
        for (const step of interaction.steps) {
          if (step.type === 'model_output' && Array.isArray(step.content)) {
            const vidContent = step.content.find(
              (c): c is { type: 'video'; data?: string; mime_type?: string } => c.type === 'video'
            );
            if (vidContent?.data) {
              videoData = vidContent.data;
              if (vidContent.mime_type) mimeType = vidContent.mime_type;
            }
          }
        }
      }

      if (!videoData) {
        res.status(502).json({
          error: 'Model gemini-omni-1.2-flash tidak mengembalikan data video untuk prompt ini.',
        });
        return;
      }

      res.json({
        dataUrl: `data:${mimeType};base64,${videoData}`,
        mimeType,
        aspectRatio,
        duration,
        prompt,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      const mapped = mapGeminiApiError(
        err,
        'Gagal membuat video dengan gemini-omni-1.2-flash. Periksa kuota atau kunci API berbayar.'
      );
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  app.post('/api/studio/image', async (req, res) => {
    const validated = validateImageRequest(req.body ?? {});
    if (!validated.ok || !validated.value) {
      res.status(400).json({ error: validated.error ?? 'Permintaan gambar tidak valid.' });
      return;
    }

    const { mode, prompt, aspectRatio, imageSize, sourceImage } = validated.value;

    try {
      const ai = createGeminiClient();
      const inputPayload =
        mode === 'edit' && sourceImage
          ? [
              {
                type: 'image' as const,
                data: sourceImage.base64,
                mime_type: sourceImage.mimeType,
              },
              {
                type: 'text' as const,
                text: prompt,
              },
            ]
          : prompt;

      const interaction = await ai.interactions.create({
        model: 'gemini-nano-banana-2.1',
        input: inputPayload,
        response_modalities: ['image', 'text'],
        generation_config: {
          image_config: {
            aspect_ratio: aspectRatio,
            image_size: imageSize,
          },
        },
      });

      let imageData: string | undefined;
      let mimeType = 'image/png';
      let caption = '';

      if (Array.isArray(interaction.steps)) {
        for (const step of interaction.steps) {
          if (step.type === 'model_output' && Array.isArray(step.content)) {
            for (const part of step.content) {
              if (part.type === 'image' && part.data) {
                imageData = part.data;
                if (part.mime_type) mimeType = part.mime_type;
              } else if (part.type === 'text' && part.text) {
                caption += part.text;
              }
            }
          }
        }
      }

      if (!imageData) {
        const directImg = interaction.output_image as
          | { data?: string; mime_type?: string }
          | null
          | undefined;
        if (directImg?.data) {
          imageData = directImg.data;
          if (directImg.mime_type) mimeType = directImg.mime_type;
        }
      }

      if (!imageData) {
        res.status(502).json({
          error: 'Model gemini-nano-banana-2.1 tidak mengembalikan gambar untuk prompt ini.',
        });
        return;
      }

      res.json({
        dataUrl: `data:${mimeType};base64,${imageData}`,
        mimeType,
        caption: caption.trim() || undefined,
        aspectRatio,
        imageSize,
        mode,
        prompt,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      const mapped = mapGeminiApiError(
        err,
        'Gagal memproses gambar dengan gemini-nano-banana-2.1. Periksa kuota atau kunci API berbayar.'
      );
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  async function generateGeminiJson<T>(
    prompt: string,
    systemInstruction: string
  ): Promise<T> {
    const ai = createGeminiClient();
    const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
    let rawText = '';
    let lastError: unknown = null;

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            ...(modelName === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        });
        rawText = (response.text ?? '').trim();
        if (rawText) break;
      } catch (modelErr) {
        lastError = modelErr;
        const errStr = modelErr instanceof Error ? modelErr.message : String(modelErr);
        const isTransient = /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|high demand/i.test(errStr);
        if (!isTransient) throw modelErr;
      }
    }

    if (!rawText) {
      if (lastError) throw lastError;
      throw new Error('Model AI tidak mengembalikan data JSON.');
    }

    const stripped = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(stripped) as T;
    } catch {
      const start = stripped.indexOf('{');
      const end = stripped.lastIndexOf('}');
      if (start !== -1 && end > start) {
        return JSON.parse(stripped.slice(start, end + 1)) as T;
      }
      throw new Error('Format JSON dari model AI tidak dapat dibaca.');
    }
  }

  function normalizeVerdict(raw: unknown): GuardianVerdict {
    const up = String(raw ?? '').toUpperCase().trim();
    if (up === 'LULUS' || up === 'PASS') return 'LULUS';
    if (up === 'DITOLAK' || up === 'REJECT' || up === 'FAIL') return 'DITOLAK';
    return 'PERLU REVISI';
  }

  function normalizeStringArray(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => String(item ?? '').trim()).filter(Boolean);
  }

  interface LocalVerseContextPayload {
    sourceReady?: boolean;
    sourceName?: string;
    verses?: Array<{ ref: string; text: string }>;
    missingRefs?: string[];
  }

  function enforceGuardianRules(
    theoRaw: Partial<GuardianReport> | undefined,
    pastoralRaw: Partial<PastoralReport> | undefined,
    extractedRefs: string[],
    localVerseContext?: LocalVerseContextPayload
  ): {
    theologicalGuardian: GuardianReport;
    pastoralSensitivity: PastoralReport;
    guardianGatePassed: boolean;
  } {
    const fatalErrors = normalizeStringArray(theoRaw?.fatalErrors);
    const warnings = normalizeStringArray(theoRaw?.warnings);
    const manualVerification = normalizeStringArray(theoRaw?.manualVerification);
    const suggestedReplacements = normalizeStringArray(theoRaw?.suggestedReplacements);
    const referencesChecked = Array.from(
      new Set([...extractedRefs, ...normalizeStringArray(theoRaw?.referencesChecked)])
    );

    if (localVerseContext?.sourceReady && Array.isArray(localVerseContext.missingRefs)) {
      for (const miss of localVerseContext.missingRefs) {
        fatalErrors.push(`Referensi "${miss}" tidak ditemukan pada file Alkitab lokal (${localVerseContext.sourceName ?? 'indo_tb.json'}).`);
      }
    } else if (extractedRefs.length === 0) {
      if (manualVerification.length === 0) {
        manualVerification.push(
          'Naskah renungan umum tanpa sitasi ayat eksplisit; tidak ditolak otomatis, tetap disarankan verifikasi editorial.'
        );
      }
    } else if (!localVerseContext?.sourceReady) {
      manualVerification.push(
        'Sumber Alkitab lokal indo_tb.json belum diaktifkan; verifikasi teks ayat secara manual sebelum publikasi.'
      );
    }

    let theoStatus = normalizeVerdict(theoRaw?.status);
    if (fatalErrors.length > 0) {
      theoStatus = 'DITOLAK';
    } else if (extractedRefs.length === 0 && theoStatus === 'DITOLAK' && fatalErrors.length === 0) {
      theoStatus = 'LULUS';
    }

    const pastoralFindings = normalizeStringArray(pastoralRaw?.findings);
    const saferSuggestions = normalizeStringArray(pastoralRaw?.saferSuggestions);
    let pastoralStatus = normalizeVerdict(pastoralRaw?.status);
    if (pastoralFindings.length > 0 && pastoralStatus === 'LULUS') {
      pastoralStatus = 'PERLU REVISI';
    }

    const theologicalGuardian: GuardianReport = {
      status: theoStatus,
      summary:
        String(theoRaw?.summary ?? '').trim() ||
        (theoStatus === 'LULUS'
          ? 'Tidak ditemukan kesalahan teologis fatal.'
          : 'Terdapat catatan teologis yang perlu ditinjau sebelum terbit.'),
      referencesChecked,
      fatalErrors,
      warnings,
      manualVerification,
      suggestedReplacements,
    };

    const pastoralSensitivity: PastoralReport = {
      status: pastoralStatus,
      summary:
        String(pastoralRaw?.summary ?? '').trim() ||
        (pastoralStatus === 'LULUS'
          ? 'Nada penyampaian hangat, penuh empati, dan aman secara pastoral.'
          : 'Terdapat kalimat sensitif yang disarankan untuk dilunakkan.'),
      findings: pastoralFindings,
      saferSuggestions,
    };

    const guardianGatePassed = canMarkReadyToPublish({
      theologicalGuardian,
      pastoralSensitivity,
    });

    return { theologicalGuardian, pastoralSensitivity, guardianGatePassed };
  }

  app.post('/api/shorts/produce', async (req, res) => {
    const body = req.body as {
      channelId?: ShortsChannelId;
      title?: string;
      bibleReference?: string;
      durationSeconds?: ShortsDuration;
      notes?: string;
      localVerseContext?: LocalVerseContextPayload;
      channelTemplate?: {
        scriptTemplate?: string;
        visualStyle?: string;
        closingCta?: string;
      };
    };

    const channelId = body?.channelId ?? 'bible-stories-3d';
    const title = String(body?.title ?? '').trim();
    const bibleReference = String(body?.bibleReference ?? '').trim();
    const durationSeconds = (Number(body?.durationSeconds) || 45) as ShortsDuration;
    const notes = String(body?.notes ?? '').trim();
    const localVerseContext = body?.localVerseContext;
    const channelTemplate = body?.channelTemplate;

    const valid = validateShortsBrief({ channelId, title, durationSeconds });
    if (!valid.ok) {
      res.status(400).json({ error: valid.error });
      return;
    }

    const channel = getChannelById(channelId);
    const budget = computeScriptWordBudget(durationSeconds);
    const localContextText =
      localVerseContext?.sourceReady && localVerseContext.verses?.length
        ? `\nTeks Alkitab Lokal (${localVerseContext.sourceName ?? 'indo_tb.json'}):\n${localVerseContext.verses
            .map((v) => `- ${v.ref}: ${v.text}`)
            .join('\n')}`
        : '';
    const templateDirectives =
      channelTemplate?.scriptTemplate && channelTemplate?.visualStyle
        ? `\n${formatTemplatePromptDirectives({
            scriptTemplate: channelTemplate.scriptTemplate,
            visualStyle: channelTemplate.visualStyle,
            closingCta: channelTemplate.closingCta ?? '',
          })}`
        : '';

    const systemInstruction = `Kamu adalah Pabrik Konten YouTube Shorts Multi-Agen berbahasa Indonesia untuk 3 channel Kristen:
1. Bible Stories 3D (cerita Alkitab animasi 3D ramah anak & keluarga, Made for Kids)
2. Daily Faith & Inspiration (renungan singkat penuh empati & pengharapan)
3. Bible Facts & Mysteries (fakta, sejarah, tokoh, tempat, konteks Alkitab secara faktual)

Kembalikan HANYA objek JSON valid dengan struktur persis:
{
  "research": { "angle": string, "keyTakeaway": string, "audienceFit": string },
  "script": { "hook": string, "narration": string, "closing": string },
  "storyboard": {
    "characterBible": [{ "name": string, "appearance": string, "wardrobe": string }],
    "scenes": [
      {
        "sceneNumber": number,
        "visualTitle": string,
        "narrationSegment": string,
        "veoPrompt": string,
        "cameraMovement": string,
        "mood": string,
        "characters": [string]
      }
    ]
  },
  "theologicalGuardian": {
    "status": "LULUS" | "PERLU REVISI" | "DITOLAK",
    "summary": string,
    "referencesChecked": [string],
    "fatalErrors": [string],
    "warnings": [string],
    "manualVerification": [string],
    "suggestedReplacements": [string]
  },
  "pastoralSensitivity": {
    "status": "LULUS" | "PERLU REVISI" | "DITOLAK",
    "summary": string,
    "findings": [string],
    "saferSuggestions": [string]
  },
  "seo": {
    "title": string,
    "description": string,
    "tags": [string],
    "hashtags": [string]
  }
}

Aturan ketat:
- Panjang gabungan hook + narration + closing harus di kisaran ${budget.minWords} sampai ${budget.maxWords} kata untuk durasi ${durationSeconds} detik.
- Storyboard harus 6 sampai 7 adegan berurutan yang potongan narrationSegment-nya mencakup seluruh naskah secara urut.
- Setiap veoPrompt WAJIB berbahasa Inggris, format vertical 9:16 cinema-grade, bebas teks/logo/watermark, mengikuti Style Visual Storyboard khusus channel bila disediakan, dan konsisten dengan characterBible.
- Theological Guardian: cek akurasi fakta Alkitab Protestan (66 kitab), jangan mengarang ayat, dan jangan menolak renungan umum hanya karena tidak ada kutipan ayat eksplisit.
- Pastoral Sensitivity Checker: pastikan tidak menghakimi, tidak mengaitkan sakit/kemiskinan dengan dosa, tidak menyerang denominasi, dan tidak menjanjikan mukjizat instan.
- SEO title maksimal 90 karakter.`;

    const prompt = `Buat paket produksi YouTube Shorts lengkap:
- Channel: ${channel.name} (${channel.focus})
- Made for Kids: ${channel.madeForKids ? 'Ya' : 'Tidak'}
- Topik: ${title}
- Referensi Alkitab: ${bibleReference || '(tidak disebutkan secara khusus)'}
- Target Durasi: ${durationSeconds} detik (${budget.minWords}–${budget.maxWords} kata)
- Catatan Tambahan: ${notes || '-'}${templateDirectives}${localContextText}`;

    try {
      const raw = await generateGeminiJson<{
        research?: { angle?: string; keyTakeaway?: string; audienceFit?: string };
        script?: { hook?: string; narration?: string; closing?: string };
        storyboard?: {
          characterBible?: Array<{ name?: string; appearance?: string; wardrobe?: string }>;
          scenes?: Array<{
            sceneNumber?: number;
            visualTitle?: string;
            narrationSegment?: string;
            veoPrompt?: string;
            cameraMovement?: string;
            mood?: string;
            characters?: string[];
          }>;
        };
        theologicalGuardian?: Partial<GuardianReport>;
        pastoralSensitivity?: Partial<PastoralReport>;
        seo?: { title?: string; description?: string; tags?: string[]; hashtags?: string[] };
      }>(prompt, systemInstruction);

      const hook = String(raw.script?.hook ?? '').trim();
      const narration = String(raw.script?.narration ?? '').trim();
      const closing = String(raw.script?.closing ?? '').trim();
      const fullText = `${hook} ${narration} ${closing}`.trim();
      const wordCount = fullText ? fullText.split(/\s+/).length : 0;

      const extractedRefs = extractIndonesianBibleReferences(fullText, bibleReference);
      const audited = enforceGuardianRules(
        raw.theologicalGuardian,
        raw.pastoralSensitivity,
        extractedRefs,
        localVerseContext
      );

      const scenes = Array.isArray(raw.storyboard?.scenes)
        ? raw.storyboard.scenes.slice(0, 8).map((s, idx) => ({
            sceneNumber: Number(s.sceneNumber) || idx + 1,
            visualTitle: String(s.visualTitle ?? `Adegan ${idx + 1}`).trim(),
            narrationSegment: String(s.narrationSegment ?? '').trim(),
            veoPrompt: String(s.veoPrompt ?? '').trim(),
            cameraMovement: String(s.cameraMovement ?? 'Gentle dolly in').trim(),
            mood: String(s.mood ?? 'Warm & reverent').trim(),
            characters: normalizeStringArray(s.characters),
          }))
        : [];

      const characterBible = Array.isArray(raw.storyboard?.characterBible)
        ? raw.storyboard.characterBible.map((c) => ({
            name: String(c.name ?? 'Tokoh').trim(),
            appearance: String(c.appearance ?? '').trim(),
            wardrobe: String(c.wardrobe ?? '').trim(),
          }))
        : [];

      const seoTitle = String(raw.seo?.title ?? title).trim().slice(0, 90);

      res.json({
        package: {
          id: `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          channelId: channel.id,
          title,
          bibleReference,
          durationSeconds,
          research: {
            angle: String(raw.research?.angle ?? '').trim() || channel.focus,
            keyTakeaway: String(raw.research?.keyTakeaway ?? '').trim() || title,
            audienceFit: String(raw.research?.audienceFit ?? '').trim() || channel.description,
          },
          script: {
            hook,
            narration,
            closing,
            wordCount,
          },
          storyboard: {
            characterBible,
            scenes,
          },
          theologicalGuardian: audited.theologicalGuardian,
          pastoralSensitivity: audited.pastoralSensitivity,
          seo: {
            title: seoTitle,
            description: String(raw.seo?.description ?? '').trim(),
            tags: normalizeStringArray(raw.seo?.tags),
            hashtags: normalizeStringArray(raw.seo?.hashtags),
            madeForKids: channel.madeForKids,
          },
          guardianGatePassed: audited.guardianGatePassed,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      const mapped = mapGeminiApiError(
        err,
        'Gagal menjalankan pipeline produksi YouTube Shorts.'
      );
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  app.post('/api/shorts/guardian', async (req, res) => {
    const body = req.body as {
      script?: string;
      reference?: string;
      localVerseContext?: LocalVerseContextPayload;
    };
    const script = String(body?.script ?? '').trim();
    const reference = String(body?.reference ?? '').trim();
    const localVerseContext = body?.localVerseContext;

    if (script.length < 15) {
      res.status(400).json({ error: 'Tempelkan naskah minimal 15 karakter untuk diaudit.' });
      return;
    }

    const extractedRefs = extractIndonesianBibleReferences(script, reference);
    const localContextText =
      localVerseContext?.sourceReady && localVerseContext.verses?.length
        ? `\nTeks Alkitab Lokal (${localVerseContext.sourceName ?? 'indo_tb.json'}):\n${localVerseContext.verses
            .map((v) => `- ${v.ref}: ${v.text}`)
            .join('\n')}`
        : '';

    const systemInstruction = `Kamu menjalankan dua pemeriksa independen berbahasa Indonesia:
1. Theological Guardian: cek akurasi Alkitab Protestan (66 kitab), kutipan ayat, dan konteks. JANGAN mengubah naskah secara langsung—hanya berikan status, temuan, dan saran pengganti. Jangan menolak renungan umum semata karena tidak mencantumkan kutipan ayat.
2. Pastoral Sensitivity Checker: cek bahasa yang menghakimi, mengaitkan sakit/kemiskinan dengan dosa, menyerang denominasi lain, kasar terhadap duka/trauma, atau janji mukjizat instan.

Kembalikan HANYA JSON valid:
{
  "theologicalGuardian": {
    "status": "LULUS" | "PERLU REVISI" | "DITOLAK",
    "summary": string,
    "referencesChecked": [string],
    "fatalErrors": [string],
    "warnings": [string],
    "manualVerification": [string],
    "suggestedReplacements": [string]
  },
  "pastoralSensitivity": {
    "status": "LULUS" | "PERLU REVISI" | "DITOLAK",
    "summary": string,
    "findings": [string],
    "saferSuggestions": [string]
  }
}`;

    try {
      const raw = await generateGeminiJson<{
        theologicalGuardian?: Partial<GuardianReport>;
        pastoralSensitivity?: Partial<PastoralReport>;
      }>(
        `Referensi tambahan: ${reference || '-'}\nNaskah:\n${script}${localContextText}`,
        systemInstruction
      );

      const audited = enforceGuardianRules(
        raw.theologicalGuardian,
        raw.pastoralSensitivity,
        extractedRefs,
        localVerseContext
      );
      res.json(audited);
    } catch (err) {
      const mapped = mapGeminiApiError(err, 'Gagal menjalankan audit Theological Guardian.');
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  app.post('/api/shorts/community-reply', async (req, res) => {
    const body = req.body as { channelId?: ShortsChannelId; comment?: string };
    const channel = getChannelById(body?.channelId ?? 'daily-faith-inspiration');
    const comment = String(body?.comment ?? '').trim();

    if (comment.length < 4 || comment.length > 1000) {
      res.status(400).json({ error: 'Komentar pemirsa harus 4–1000 karakter.' });
      return;
    }

    const systemInstruction = `Kamu adalah Community & Prayer Manager berbahasa Indonesia untuk channel YouTube ${channel.name}.
Tugas: menyusun draf balasan komentar atau permohonan doa yang hangat, penuh empati, menenangkan, tidak menghakimi, dan tidak menjanjikan mukjizat instan.
ATURAN KETAT:
- Balasan WAJIB maksimal 3 kalimat singkat.
- Klasifikasikan careFlag:
  - "urgent_safety" jika ada indikasi bahaya diri, keputusasaan ekstrem, atau krisis keselamatan.
  - "needs_human_care" jika ada duka mendalam, sakit berat, konflik keluarga, atau kebutuhan konseling manusia.
  - "normal" untuk apresiasi, pertanyaan umum, atau permohonan doa harian biasa.
- Kembalikan HANYA JSON: { "reply": string, "careFlag": "normal" | "needs_human_care" | "urgent_safety", "note": string }`;

    try {
      const raw = await generateGeminiJson<{
        reply?: string;
        careFlag?: string;
        note?: string;
      }>(`Komentar pemirsa di ${channel.name}:\n${comment}`, systemInstruction);

      const cappedReply = enforceThreeSentenceCap(String(raw.reply ?? ''));
      const flagRaw = String(raw.careFlag ?? 'normal').trim();
      const careFlag: CareFlag =
        flagRaw === 'urgent_safety' || flagRaw === 'needs_human_care' ? flagRaw : 'normal';

      res.json({
        reply:
          cappedReply ||
          'Terima kasih sudah berbagi bersama kami. Kami turut mendoakan agar damai sejahtera dan kekuatan dari Tuhan menyertai langkah Anda hari ini.',
        careFlag,
        note:
          String(raw.note ?? '').trim() ||
          'Draf ini disusun untuk ditinjau dan disalin manual ke YouTube Studio.',
      });
    } catch (err) {
      const mapped = mapGeminiApiError(err, 'Gagal menyusun draf balasan komunitas.');
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  app.post('/api/shorts/bible-plan', async (req, res) => {
    const body = req.body as {
      scopeLabel?: string;
      books?: Array<{ id: string; name: string; chapterCount: number }>;
      channelId?: ShortsChannelId;
      durationSeconds?: ShortsDuration;
    };

    const books = Array.isArray(body?.books) ? body.books.slice(0, 5) : [];
    if (books.length === 0) {
      res.status(400).json({ error: 'Pilih minimal 1 kitab Alkitab untuk direncanakan.' });
      return;
    }

    const channel = getChannelById(body?.channelId ?? 'bible-stories-3d');
    const durationSeconds = (Number(body?.durationSeconds) || 45) as ShortsDuration;
    const scopeLabel = String(body?.scopeLabel ?? 'Seri Alkitab').trim();

    const systemInstruction = `Kamu adalah perencana seri YouTube Shorts Alkitab Protestan (66 kitab) berbahasa Indonesia untuk channel ${channel.name}.
Susun 5 sampai 8 episode berurutan yang runtut secara kronologis/tekstual untuk kitab yang diminta.
Kembalikan HANYA JSON valid:
{
  "episodes": [
    {
      "sequenceNo": number,
      "bookName": string,
      "title": string,
      "reference": string,
      "summary": string,
      "centralTheme": string,
      "teachingPoint": string,
      "hook": string
    }
  ]
}`;

    const bookListStr = books.map((b) => `${b.name} (${b.chapterCount} pasal)`).join(', ');
    try {
      const raw = await generateGeminiJson<{
        episodes?: Array<Record<string, unknown>>;
      }>(
        `Rencanakan seri Shorts berurutan (${durationSeconds} detik/episode) untuk kelompok "${scopeLabel}" dengan kitab terpilih: ${bookListStr}. Target channel: ${channel.name} (${channel.focus}).`,
        systemInstruction
      );

      const episodes = Array.isArray(raw.episodes)
        ? raw.episodes.slice(0, 10).map((ep, idx) => ({
            sequenceNo: Number(ep.sequenceNo) || idx + 1,
            bookName: String(ep.bookName ?? books[0].name).trim(),
            title: String(ep.title ?? `Episode ${idx + 1}`).trim(),
            reference: String(ep.reference ?? '').trim(),
            summary: String(ep.summary ?? '').trim(),
            centralTheme: String(ep.centralTheme ?? '').trim(),
            teachingPoint: String(ep.teachingPoint ?? '').trim(),
            hook: String(ep.hook ?? '').trim(),
          }))
        : [];

      res.json({ episodes });
    } catch (err) {
      const mapped = mapGeminiApiError(err, 'Gagal menyusun rencana episode Seri Alkitab.');
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  app.post('/api/shorts/church-clips', async (req, res) => {
    const body = req.body as {
      sermonTitle?: string;
      transcript?: string;
      channelId?: ShortsChannelId;
      durationSeconds?: ShortsDuration;
    };

    const sermonTitle = String(body?.sermonTitle ?? '').trim();
    const transcript = String(body?.transcript ?? '').trim();
    const channel = getChannelById(body?.channelId ?? 'daily-faith-inspiration');
    const durationSeconds = (Number(body?.durationSeconds) || 45) as ShortsDuration;

    if (sermonTitle.length < 3 || transcript.length < 30) {
      res.status(400).json({
        error: 'Isi judul khotbah (min. 3 karakter) dan catatan/transkrip khotbah (min. 30 karakter).',
      });
      return;
    }

    const systemInstruction = `Kamu adalah Divisi Church Shorts berbahasa Indonesia yang mengekstrak 3 sampai 4 ide klip YouTube Shorts vertikal 9:16 dari ringkasan atau transkrip khotbah gereja.
Setiap klip harus setia pada isi khotbah, hangat secara pastoral, tidak menghakimi, dan tidak mengarang ayat Alkitab.
Kembalikan HANYA JSON valid:
{
  "clips": [
    {
      "clipNumber": number,
      "title": string,
      "hook": string,
      "highlightQuote": string,
      "bibleReference": string,
      "suggestedChannelId": "bible-stories-3d" | "daily-faith-inspiration" | "bible-facts-mysteries",
      "durationSeconds": 30 | 45 | 60,
      "visualDirection": string
    }
  ]
}`;

    try {
      const raw = await generateGeminiJson<{
        clips?: Array<Record<string, unknown>>;
      }>(
        `Judul Khotbah / Ibadah: ${sermonTitle}\nChannel Utama: ${channel.name}\nDurasi Target: ${durationSeconds} detik\nRingkasan / Transkrip:\n${transcript.slice(0, 5500)}`,
        systemInstruction
      );

      const validChannels: ShortsChannelId[] = [
        'bible-stories-3d',
        'daily-faith-inspiration',
        'bible-facts-mysteries',
      ];
      const clips = Array.isArray(raw.clips)
        ? raw.clips.slice(0, 5).map((clip, idx) => {
            const chRaw = String(clip.suggestedChannelId ?? channel.id) as ShortsChannelId;
            const durRaw = Number(clip.durationSeconds);
            const dur: ShortsDuration =
              durRaw === 30 || durRaw === 45 || durRaw === 60 ? durRaw : durationSeconds;
            return {
              clipNumber: Number(clip.clipNumber) || idx + 1,
              title: String(clip.title ?? `Klip Khotbah ${idx + 1}`).trim(),
              hook: String(clip.hook ?? '').trim(),
              highlightQuote: String(clip.highlightQuote ?? '').trim(),
              bibleReference: String(clip.bibleReference ?? '').trim(),
              suggestedChannelId: validChannels.includes(chRaw) ? chRaw : channel.id,
              durationSeconds: dur,
              visualDirection: String(clip.visualDirection ?? '').trim(),
            };
          })
        : [];

      res.json({ clips });
    } catch (err) {
      const mapped = mapGeminiApiError(err, 'Gagal mengekstrak ide klip Church Shorts.');
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kantor AI 3D server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Kantor AI 3D server:', err);
  process.exit(1);
});
