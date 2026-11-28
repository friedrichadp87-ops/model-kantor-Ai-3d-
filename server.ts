import 'dotenv/config';
import express from 'express';
import { execFile } from 'node:child_process';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { verifyFirebaseIdToken, isAllowedFirebaseUid } from './src/server/firebaseIdToken.ts';
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
import {
  BUILDING_FLOORS,
  FLOOR_ORDER,
  getChannelIdByFloor,
  getFloorByChannelId,
  getFloorEmployeeIdentity,
  isFloorId,
  type FloorId,
} from './src/office/buildingFloors.ts';
import {
  CHANNEL_KEY_ROUTING,
  buildPipelineSrt,
  evaluateFinalQcGate,
  getChannelWorkflowBlueprint,
  normalizeTimestampedScenes,
  resolveChannelKeySlot,
  validateOneCommandInput,
  type ChannelKeySlotStatus,
  type FinalQcCheckItem,
  type FinalQcReport,
  type PipelineSceneCount,
  type PipelineSceneItem,
  type RawSceneBlueprint,
} from './src/office/productionPipeline.ts';
import {
  BIBLE_FACT_CATEGORIES,
  buildBibleChapterStoryPlan,
  evaluateLocalAvSyncCheck,
  type BibleFactCategory,
  type BiblePlanScopeType,
} from './src/office/floor2And3Workflows.ts';
import { normalizeNetlifyApiPath } from './src/server/netlifyPath.ts';
import { isValidEnvSecret, sanitizeEnvDefault } from './src/server/envSecrets.ts';

const execFileAsync = promisify(execFile);

const __filename =
  typeof import.meta !== 'undefined' && typeof import.meta.url === 'string' && import.meta.url
    ? fileURLToPath(import.meta.url)
    : path.resolve(process.cwd(), 'server.ts');
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const FALLBACK_MASTER_BIBLE_CONTEXT = [
  'ATURAN MUTLAK SUMBER UTAMA ALKITAB (BERLAKU DI SELURUH LANTAI 1, 2 & 3 KANTOR AI 3D):',
  'Alkitab Terjemahan Baru (TB) yang diunggah pemilik adalah sumber utama untuk semua pekerjaan yang memakai rujukan Alkitab.',
  'Jangan pernah mengarang kutipan ayat. Bila kutipan verbatim tidak tersedia dari Master Alkitab Firestore, nyatakan bahwa rujukan perlu diverifikasi dan jangan mengklaim kutipan berasal dari TB.',
].join('\\n');

function masterBibleRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
}

function getMasterBibleContext(input: unknown): string {
  const value = masterBibleRecord(input).masterBibleContext;
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 35_000)
    : FALLBACK_MASTER_BIBLE_CONTEXT;
}

function getMasterBibleVerses(input: unknown, reference?: string): Array<{ ref: string; text: string }> {
  const value = masterBibleRecord(input).masterBibleVerses;
  if (!Array.isArray(value)) return [];
  const verses = value
    .slice(0, 24)
    .map((item) => {
      const row = masterBibleRecord(item);
      return {
        ref: typeof row.ref === 'string' ? row.ref.slice(0, 100) : '',
        text: typeof row.text === 'string' ? row.text.slice(0, 1800) : '',
      };
    })
    .filter((item) => item.ref && item.text);
  if (!reference?.trim()) return verses;
  const normalized = reference.trim().toLocaleLowerCase('id-ID').replace(/\\s+/g, ' ');
  const matched = verses.filter((item) => {
    const ref = item.ref.toLocaleLowerCase('id-ID').replace(/\\s+/g, ' ');
    return ref === normalized || normalized.startsWith(ref) || ref.startsWith(normalized);
  });
  return matched.length ? matched : verses.slice(0, 4);
}

function isMasterBibleActive(input: unknown): boolean {
  return masterBibleRecord(input).masterBibleActive === true;
}


function resolveGeminiKeyForChannel(channelId?: ShortsChannelId): {
  apiKey: string;
  keySlotUsed: string;
  source: 'dedicated' | 'fallback_global';
} {
  if (channelId && channelId in CHANNEL_KEY_ROUTING) {
    const slot = resolveChannelKeySlot(channelId);
    const dedicated = process.env[slot.geminiEnvVar];
    if (isValidEnvSecret(dedicated, 'MY_GEMINI_API_KEY')) {
      return {
        apiKey: dedicated.trim(),
        keySlotUsed: slot.geminiEnvVar,
        source: 'dedicated',
      };
    }
  }

  const globalKey = process.env.GEMINI_API_KEY;
  if (isValidEnvSecret(globalKey, 'MY_GEMINI_API_KEY')) {
    return {
      apiKey: globalKey.trim(),
      keySlotUsed: 'GEMINI_API_KEY',
      source: 'fallback_global',
    };
  }

  // If no channelId was specified (e.g. generic health/test call), allow any valid dedicated floor key
  if (!channelId) {
    for (const floorId of FLOOR_ORDER) {
      const slot = CHANNEL_KEY_ROUTING[BUILDING_FLOORS[floorId].channelId];
      const dedicated = process.env[slot.geminiEnvVar];
      if (isValidEnvSecret(dedicated, 'MY_GEMINI_API_KEY')) {
        return {
          apiKey: dedicated.trim(),
          keySlotUsed: slot.geminiEnvVar,
          source: 'dedicated',
        };
      }
    }
  }

  throw new Error('GEMINI_API_KEY belum dikonfigurasi pada server.');
}

function resolveElevenLabsKeyForChannel(channelId?: ShortsChannelId): {
  apiKey: string;
  keySlotUsed: string;
  source: 'dedicated' | 'fallback_global';
} | null {
  if (channelId && channelId in CHANNEL_KEY_ROUTING) {
    const slot = resolveChannelKeySlot(channelId);
    const dedicated = process.env[slot.elevenLabsEnvVar];
    if (isValidEnvSecret(dedicated, 'MY_ELEVENLABS_API_KEY')) {
      return {
        apiKey: dedicated.trim(),
        keySlotUsed: slot.elevenLabsEnvVar,
        source: 'dedicated',
      };
    }
  }

  const globalKey = process.env.ELEVENLABS_API_KEY;
  if (isValidEnvSecret(globalKey, 'MY_ELEVENLABS_API_KEY')) {
    return {
      apiKey: globalKey.trim(),
      keySlotUsed: 'ELEVENLABS_API_KEY',
      source: 'fallback_global',
    };
  }
  return null;
}

function resolveFloorAndChannel(input?: {
  floorId?: unknown;
  channelId?: unknown;
}): { floorId: FloorId; channelId: ShortsChannelId } | null {
  const rawFloor = Number(input?.floorId);
  if (isFloorId(rawFloor)) {
    return {
      floorId: rawFloor,
      channelId: getChannelIdByFloor(rawFloor),
    };
  }
  const rawChannel = input?.channelId;
  if (
    rawChannel === 'daily-faith-inspiration' ||
    rawChannel === 'bible-stories-3d' ||
    rawChannel === 'bible-facts-mysteries'
  ) {
    return {
      floorId: getFloorByChannelId(rawChannel).floorId,
      channelId: rawChannel,
    };
  }
  return null;
}

function getChannelKeyRoutingStatus(): ChannelKeySlotStatus[] {
  const globalGeminiOk = isValidEnvSecret(process.env.GEMINI_API_KEY, 'MY_GEMINI_API_KEY');
  const globalElevenOk = isValidEnvSecret(process.env.ELEVENLABS_API_KEY, 'MY_ELEVENLABS_API_KEY');

  return FLOOR_ORDER.map((floorId) => {
    const floorCfg = BUILDING_FLOORS[floorId];
    const channelId = floorCfg.channelId;
    const slot = CHANNEL_KEY_ROUTING[channelId];
    const hasDedicatedGemini = isValidEnvSecret(
      process.env[slot.geminiEnvVar],
      'MY_GEMINI_API_KEY'
    );
    const hasDedicatedEleven = isValidEnvSecret(
      process.env[slot.elevenLabsEnvVar],
      'MY_ELEVENLABS_API_KEY'
    );

    return {
      floorId,
      floorLabel: floorCfg.label,
      channelId,
      channelLabel: slot.channelLabel,
      geminiEnvVar: slot.geminiEnvVar,
      geminiSource: hasDedicatedGemini
        ? 'dedicated'
        : globalGeminiOk
        ? 'fallback_global'
        : 'missing',
      elevenLabsEnvVar: slot.elevenLabsEnvVar,
      elevenLabsSource: hasDedicatedEleven
        ? 'dedicated'
        : globalElevenOk
        ? 'fallback_global'
        : 'missing',
    };
  });
}

function createGeminiClient(channelId?: ShortsChannelId): GoogleGenAI {
  const { apiKey } = resolveGeminiKeyForChannel(channelId);
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function createGeminiClientWithMeta(channelId?: ShortsChannelId): {
  ai: GoogleGenAI;
  keySlotUsed: string;
  source: 'dedicated' | 'fallback_global';
} {
  const resolved = resolveGeminiKeyForChannel(channelId);
  return {
    ai: new GoogleGenAI({
      apiKey: resolved.apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    }),
    keySlotUsed: resolved.keySlotUsed,
    source: resolved.source,
  };
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

export function createApiApp(): express.Express {
  const app = express();
  const defaultJsonParser = express.json({ limit: '15mb' });
  const apiRateWindows = new Map<string, { startedAt: number; count: number }>();

  // Normalize Netlify Functions URL prefix (/.netlify/functions/api/...) so all /api/* routes match identically
  app.use((req, _res, next) => {
    const normalized = normalizeNetlifyApiPath(req.url);
    if (normalized !== req.url) {
      req.url = normalized;
    }
    next();
  });

  // Provider-backed and state-changing routes require a valid Firebase session.
  // Health/version probes are deliberately public and return no private user data.
  app.use('/api', async (req, res, next) => {
    if (req.method === 'GET' && (req.path === '/health' || req.path === '/pwa/remote-version')) {
      next();
      return;
    }

    const match = /^Bearer\\s+(.+)$/i.exec(req.header('authorization') ?? '');
    if (!match) {
      res.status(401).json({ error: 'Autentikasi Firebase diperlukan untuk menggunakan API ini.' });
      return;
    }

    try {
      const claims = await verifyFirebaseIdToken(match[1].trim());
      if (!isAllowedFirebaseUid(claims.sub)) {
        res.status(403).json({ error: 'Akun Firebase ini tidak diizinkan menggunakan API Kantor AI.' });
        return;
      }

      const now = Date.now();
      const current = apiRateWindows.get(claims.sub);
      if (!current || now - current.startedAt >= 60_000) {
        apiRateWindows.set(claims.sub, { startedAt: now, count: 1 });
      } else if (++current.count > 120) {
        res.status(429).json({ error: 'Batas sementara 120 permintaan API per menit tercapai. Coba kembali sebentar lagi.' });
        return;
      }

      res.locals.firebaseUid = claims.sub;
      res.locals.firebaseEmail = typeof claims.email === 'string' ? claims.email : null;
      next();
    } catch {
      res.status(401).json({ error: 'Token Firebase tidak valid atau kedaluwarsa. Silakan masuk kembali.' });
    }
  });

  app.use((req, res, next) => {
    if (req.path === '/api/pipeline/assemble-video') {
      next();
      return;
    }
    defaultJsonParser(req, res, next);
  });

  // Master Bible is never held in serverless memory. The authenticated client reads
  // the user's Firestore Master Bible and supplies only the relevant policy/verse context.
  app.all('/api/bible/master', (_req, res) => {
    res.status(410).json({
      error: 'Penyimpanan Master Alkitab di memori server sudah dihentikan. Gunakan Master Alkitab Firestore.',
    });
  });

  // Lantai 1 Daily Faith & Inspiration — Riset Sumber Renungan Harian Valid (LAI / Sumber Terpercaya) via Google Search Grounding
  app.post('/api/devotional/research', async (req, res) => {
    const body = req.body as { topicHint?: string } | undefined;
    const topicHint = String(body?.topicHint ?? '').trim().slice(0, 180);
    const todayWib = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());

    const biblePolicy = { policyBlock: getMasterBibleContext(body) };

    const systemInstruction = `Kamu adalah Tim Riset Renungan Harian Lantai 1 (Daily Faith & Inspiration) di Kantor AI 3D.
Tugasmu mencari dan menyusun ringkasan tema renungan harian Kristen yang VALID, alkitabiah, dan memberkati untuk hari ini (${todayWib}), memprioritaskan sumber terpercaya seperti Lembaga Alkitab Indonesia (LAI / alkitab.or.id), Sabda.org, atau renungan harian gerejawi yang sah.

${biblePolicy.policyBlock}

ATURAN FORMAT KELUARAN:
Kembalikan ringkasan yang jelas dalam Bahasa Indonesia dengan baris berlabel tepat seperti ini (tanpa markdown codefence):
JUDUL: <judul renungan harian yang hangat & memberkati>
AYAT: <referensi kitab pasal:ayat Terjemahan Baru, misal Mazmur 27:14 atau Filipi 4:6-7>
SUMBER_VALID: <nama lembaga/sumber renungan valid yang dirujuk>
PESAN_INTI: <2-3 kalimat ringkasan makna renungan untuk durasi 2 menit 50 detik>
MOOD_ANIMASI: <saran visual latar animasi lembut yang selaras dengan isi renungan ini>
PERINTAH_PRODUKSI: <1 paragraf instruksi siap eksekusi untuk membuat renungan 2 menit 50 detik (170 detik) dengan animasi latar selaras isi renungan>`;

    const userPrompt = topicHint
      ? `Carikan inspirasi renungan harian Kristen yang valid (utamakan Lembaga Alkitab Indonesia / sumber terpercaya) untuk ${todayWib} dengan fokus tema: "${topicHint}". Pastikan berakar kuat pada Alkitab Terjemahan Baru.`
      : `Carikan inspirasi renungan harian Kristen yang valid (utamakan Lembaga Alkitab Indonesia / alkitab.or.id / Sabda / renungan harian terpercaya) untuk hari ini (${todayWib}) yang sangat memberkati pendengar dalam format narasi 2 menit 50 detik.`;

    try {
      const { ai, keySlotUsed } = createGeminiClientWithMeta('daily-faith-inspiration');
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawText = (response.text ?? '').trim();
      const extractField = (label: string): string => {
        const re = new RegExp(`^${label}\\s*:\\s*(.+)$`, 'im');
        const m = re.exec(rawText);
        return m ? m[1].trim() : '';
      };

      const title =
        extractField('JUDUL') || `Renungan Harian ${todayWib}: Pengharapan di Dalam Tuhan`;
      const rawRef = extractField('AYAT');
      const detectedRefs = extractIndonesianBibleReferences(`${rawRef} ${rawText}`);
      const bibleReference = detectedRefs[0] || rawRef || 'Mazmur 27:14';
      const sourceName =
        extractField('SUMBER_VALID') || 'Lembaga Alkitab Indonesia (LAI) & Alkitab Terjemahan Baru';
      const coreSummary =
        extractField('PESAN_INTI') ||
        rawText.replace(/\s+/g, ' ').slice(0, 320) ||
        'Renungan harian penuh pengharapan yang berakar pada firman Tuhan Terjemahan Baru.';
      const visualMood =
        extractField('MOOD_ANIMASI') ||
        'Cahaya fajar keemasan lembut di atas perbukitan tenang dan aliran air damai yang mengikuti alur renungan.';
      const recommendedCommand =
        extractField('PERINTAH_PRODUKSI') ||
        `Susun renungan harian penuh berkat berdurasi 2 menit 50 detik (170 detik) berjudul "${title}" berdasarkan Alkitab Terjemahan Baru ${bibleReference}. ${coreSummary} Sesuaikan animasi latar yang damai: ${visualMood}`;

      const groundingChunks =
        (
          response.candidates?.[0] as
            | {
                groundingMetadata?: {
                  groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
                };
              }
            | undefined
        )?.groundingMetadata?.groundingChunks ?? [];

      const sourceLinks: Array<{ title: string; uri: string }> = [];
      for (const chunk of groundingChunks) {
        const uri = chunk.web?.uri?.trim();
        const linkTitle = chunk.web?.title?.trim() || uri || '';
        if (uri && !sourceLinks.some((l) => l.uri === uri)) {
          sourceLinks.push({ title: linkTitle, uri });
        }
      }

      const matchedMasterVerses = getMasterBibleVerses(body, bibleReference);

      res.json({
        dateLabel: todayWib,
        title,
        bibleReference,
        sourceName,
        coreSummary,
        visualMood,
        recommendedCommand,
        sourceLinks: sourceLinks.slice(0, 5),
        matchedMasterVerses,
        masterBibleActive: isMasterBibleActive(body),
        keySlotUsed,
        researchedAt: new Date().toISOString(),
      });
    } catch (err) {
      const mapped = mapGeminiApiError(
        err,
        'Gagal mengambil riset sumber renungan harian valid dari Lantai 1.'
      );
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  function isGeminiKeyConfigured(): boolean {
    if (isValidEnvSecret(process.env.GEMINI_API_KEY, 'MY_GEMINI_API_KEY')) {
      return true;
    }
    return FLOOR_ORDER.some((floorId) => {
      const slot = CHANNEL_KEY_ROUTING[BUILDING_FLOORS[floorId].channelId];
      return isValidEnvSecret(process.env[slot.geminiEnvVar], 'MY_GEMINI_API_KEY');
    });
  }

  function isElevenLabsKeyConfigured(): boolean {
    if (isValidEnvSecret(process.env.ELEVENLABS_API_KEY, 'MY_ELEVENLABS_API_KEY')) {
      return true;
    }
    return FLOOR_ORDER.some((floorId) => {
      const slot = CHANNEL_KEY_ROUTING[BUILDING_FLOORS[floorId].channelId];
      return isValidEnvSecret(process.env[slot.elevenLabsEnvVar], 'MY_ELEVENLABS_API_KEY');
    });
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

  let ffmpegAvailableCache: boolean | null = null;
  async function checkFfmpegAvailable(): Promise<boolean> {
    if (ffmpegAvailableCache !== null) return ffmpegAvailableCache;
    try {
      await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
      ffmpegAvailableCache = true;
    } catch {
      ffmpegAvailableCache = false;
    }
    return ffmpegAvailableCache;
  }

  app.get('/api/providers/status', async (_req, res) => {
    const defaultGeminiModel: GeminiTextModelId = 'gemini-4-hydrogen';
    const ffmpegAvailable = await checkFfmpegAvailable();
    res.json({
      gemini: {
        configured: isGeminiKeyConfigured(),
        defaultModel: defaultGeminiModel,
      },
      elevenlabs: {
        configured: isElevenLabsKeyConfigured(),
        defaultVoiceId: sanitizeEnvDefault(process.env.ELEVENLABS_VOICE_ID, '21m00Tcm4TlvDq8ikWAM'),
        defaultModelId: sanitizeEnvDefault(process.env.ELEVENLABS_MODEL_ID, 'eleven_multilingual_v2'),
      },
      ollama: {
        defaultBaseUrl: sanitizeEnvDefault(process.env.OLLAMA_BASE_URL, 'http://127.0.0.1:11434'),
        defaultModel: sanitizeEnvDefault(process.env.OLLAMA_MODEL, 'llama3.2'),
      },
      channelRouting: getChannelKeyRoutingStatus(),
      ffmpegAvailable,
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
    const floorTarget = resolveFloorAndChannel(req.body as { floorId?: unknown; channelId?: unknown });
    const resolvedKey = resolveElevenLabsKeyForChannel(floorTarget?.channelId);
    if (!resolvedKey) {
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
            'xi-api-key': resolvedKey.apiKey,
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
              ? `Kunci ${resolvedKey.keySlotUsed} ditolak oleh ElevenLabs. Periksa di Settings > Secrets.`
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
        floorId: floorTarget?.floorId,
        channelId: floorTarget?.channelId,
        keySlotUsed: resolvedKey.keySlotUsed,
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
          floorId?: number;
          channelId?: ShortsChannelId;
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

    const resolvedFloor = resolveFloorAndChannel(body) ?? {
      floorId: 1 as FloorId,
      channelId: getChannelIdByFloor(1),
    };
    const floorCfg = BUILDING_FLOORS[resolvedFloor.floorId];
    const floorEmployee = getFloorEmployeeIdentity(resolvedFloor.floorId, specialist.id);

    const persona = {
      name: floorEmployee.name,
      role: `${specialist.roleTitle} (${specialist.jobTitleId})`,
      specialty: `${specialist.summary}. Tanggung jawab: ${specialist.responsibilities.join(' ')}`,
    };

    const biblePolicy = { policyBlock: getMasterBibleContext(body) };
    const systemInstruction =
      `Kamu adalah ${persona.name}, menjabat sebagai ${persona.role} di ${floorCfg.label} (${floorCfg.channelName} — ${floorCfg.subtitle}) pada Menara Kantor AI 3D. ` +
      `Fokus kerjamu: ${persona.specialty} ` +
      `Jawab langsung dalam Bahasa Indonesia yang ringkas, terstruktur, dan siap eksekusi sesuai arah channel ${floorCfg.channelName} (maksimal 120 kata, gunakan 3-4 poin konkret tanpa basa-basi pembuka yang panjang).\n\n` +
      biblePolicy.policyBlock;
    const userPrompt = `Tugas dari pimpinan kantor untuk ${persona.name} (${floorCfg.label} · ${floorCfg.channelName}) — ${persona.role}:\n${task}`;

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
            floorId: resolvedFloor.floorId,
            channelId: resolvedFloor.channelId,
            keySlotUsed: 'OLLAMA_LOCAL',
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
          const { ai, keySlotUsed, source } = createGeminiClientWithMeta(resolvedFloor.channelId);
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
            floorId: resolvedFloor.floorId,
            channelId: resolvedFloor.channelId,
            keySlotUsed,
            keySource: source,
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
    const floorTarget = resolveFloorAndChannel(req.body as { floorId?: unknown; channelId?: unknown });

    try {
      const { ai, keySlotUsed } = createGeminiClientWithMeta(floorTarget?.channelId);
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
        floorId: floorTarget?.floorId,
        channelId: floorTarget?.channelId,
        keySlotUsed,
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
    const floorTarget = resolveFloorAndChannel(req.body as { floorId?: unknown; channelId?: unknown });

    try {
      const { ai, keySlotUsed } = createGeminiClientWithMeta(floorTarget?.channelId);
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
        floorId: floorTarget?.floorId,
        channelId: floorTarget?.channelId,
        keySlotUsed,
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
    systemInstruction: string,
    channelId?: ShortsChannelId
  ): Promise<T> {
    const ai = createGeminiClient(channelId);
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

    const serverBiblePolicy = { policyBlock: getMasterBibleContext(body) };

    const systemInstruction = `Kamu adalah Pabrik Konten YouTube Multi-Agen berbahasa Indonesia untuk 3 channel Kristen:
1. Bible Stories 3D (cerita Alkitab animasi 3D ramah anak & keluarga, Made for Kids)
2. Daily Faith & Inspiration (renungan harian penuh berkat ±2 menit 50 detik berbasis sumber valid & Alkitab TB, animasi latar selaras isi renungan)
3. Bible Facts & Mysteries (fakta, sejarah, tokoh, tempat, konteks Alkitab secara faktual)

${serverBiblePolicy.policyBlock}

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
      }>(prompt, systemInstruction, channel.id);

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
      const floorTarget = resolveFloorAndChannel(req.body as { floorId?: unknown; channelId?: unknown });
      const raw = await generateGeminiJson<{
        theologicalGuardian?: Partial<GuardianReport>;
        pastoralSensitivity?: Partial<PastoralReport>;
      }>(
        `Referensi tambahan: ${reference || '-'}\nNaskah:\n${script}${localContextText}`,
        systemInstruction,
        floorTarget?.channelId
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
      }>(`Komentar pemirsa di ${channel.name}:\n${comment}`, systemInstruction, channel.id);

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
        systemInstruction,
        channel.id
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
        systemInstruction,
        channel.id
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

  // =========================================================================
  // ORKESTRATOR PRODUKSI 1-PERINTAH (END-TO-END PIPELINE + 3-CHANNEL ROUTING)
  // =========================================================================

  function parseBase64DataUrl(
    dataUrl: unknown,
    allowedMimes: string[],
    maxBytes: number
  ): { mimeType: string; buffer: Buffer; base64: string } | null {
    if (typeof dataUrl !== 'string') return null;
    const match = dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) return null;
    const mimeType = match[1].toLowerCase();
    if (!allowedMimes.includes(mimeType)) return null;
    const cleanBase64 = match[2].replace(/\s+/g, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length === 0 || buffer.length > maxBytes) return null;
    return { mimeType, buffer, base64: cleanBase64 };
  }

  // =========================================================================
  // LANTAI 2: PERENCANA SERI CERITA ALKITAB 3D (KEJADIAN 1 -> WAHYU 22 · 1 PASAL = 1 CERITA)
  // =========================================================================
  app.post('/api/bible-stories/plan', async (req, res) => {
    const body = req.body as {
      scopeType?: BiblePlanScopeType;
      bookId?: string;
      startIndex?: number;
      batchSize?: number;
      enrichWithAi?: boolean;
    };

    const scopeType: BiblePlanScopeType =
      body?.scopeType === 'old' ||
      body?.scopeType === 'new' ||
      body?.scopeType === 'book' ||
      body?.scopeType === 'all'
        ? body.scopeType
        : 'old';
    const bookId = typeof body?.bookId === 'string' ? body.bookId.trim() : undefined;
    const startIndex = Math.max(0, Math.round(Number(body?.startIndex) || 0));
    const batchSize = Math.max(1, Math.min(8, Math.round(Number(body?.batchSize) || 5)));

    const basePlan = buildBibleChapterStoryPlan({
      scopeType,
      bookId,
      startIndex,
      batchSize,
    });

    if (body?.enrichWithAi === false) {
      res.json({
        plan: basePlan,
        aiEnriched: false,
        masterBibleActive: isMasterBibleActive(body),
        keySlotUsed: resolveGeminiKeyForChannel('bible-stories-3d').keySlotUsed,
      });
      return;
    }

    try {
      const { ai, keySlotUsed } = createGeminiClientWithMeta('bible-stories-3d');
      const refListText = basePlan.episodes.map((ep) => ep.reference).join(', ');
      const biblePolicy = { policyBlock: getMasterBibleContext(body) };

      const systemInstruction = `Kamu adalah Tim Perencana Cerita Alkitab Lantai 2 (Bible Stories 3D).
Tugasmu menyusun rencana detail episode berdasarkan aturan MUTLAK:
- 1 PASAL = 1 CERITA UTUH (walaupun kisah Alkitabnya masih bersambung ke pasal berikutnya, jangan menggabungkan dua pasal ke dalam satu cerita).
- Setiap episode ditargetkan berdurasi 2 menit 50 detik (170 detik = 17 adegan × 10 detik) untuk animasi 3D ramah keluarga.
- Soroti percakapan/dialog penting tokoh di pasal tersebut agar agen penulis berikutnya dapat memasukkan percakapan tersebut langsung ke narasi audio.

${biblePolicy.policyBlock}

Kembalikan HANYA JSON valid:
{
  "episodes": [
    {
      "reference": string,
      "storyTitle": string,
      "storySummary": string,
      "dialogueHighlight": string,
      "continuityNote": string
    }
  ]
}`;

      const prompt = `Cakupan Seri: ${basePlan.scopeLabel} (Total ${basePlan.totalStories} cerita dengan aturan 1 pasal = 1 cerita).
Susun rencana detail untuk batch ${basePlan.episodes.length} pasal berikut secara berurutan:
${basePlan.episodes
  .map((ep) => `- Episode #${ep.episodeNumber}/${ep.totalEpisodesInScope}: ${ep.reference}`)
  .join('\n')}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawText = (response.text ?? '').trim();
      const parsed = JSON.parse(rawText) as {
        episodes?: Array<{
          reference?: string;
          storyTitle?: string;
          storySummary?: string;
          dialogueHighlight?: string;
          continuityNote?: string;
        }>;
      };

      const aiEps = Array.isArray(parsed.episodes) ? parsed.episodes : [];
      const mergedEpisodes = basePlan.episodes.map((ep, idx) => {
        const aiItem = aiEps[idx];
        const storyTitle = String(aiItem?.storyTitle ?? '').trim() || ep.storyTitle;
        const storySummary = String(aiItem?.storySummary ?? '').trim() || ep.storySummary;
        const dialogueHighlight =
          String(aiItem?.dialogueHighlight ?? '').trim() || ep.dialogueHighlight;
        const continuityNote = String(aiItem?.continuityNote ?? '').trim() || ep.continuityNote;
        const recommendedCommand = `Buatkan cerita lengkap Bible Stories 3D khusus 1 pasal penuh yaitu ${ep.reference} — "${storyTitle}" (Episode #${ep.episodeNumber}/${ep.totalEpisodesInScope} ${basePlan.scopeLabel}) berlandaskan Master Alkitab Terjemahan Baru. Ringkasan: ${storySummary} Pastikan percakapan tokoh (${dialogueHighlight}) masuk langsung ke dalam narasi audio, bagi menjadi tepat 17 adegan × 10 detik (2 menit 50 detik / 170 detik), dan jaga kesinambungan: ${continuityNote}.`;
        return {
          ...ep,
          storyTitle,
          storySummary,
          dialogueHighlight,
          continuityNote,
          recommendedCommand,
        };
      });

      res.json({
        plan: {
          ...basePlan,
          episodes: mergedEpisodes,
        },
        aiEnriched: true,
        masterBibleActive: isMasterBibleActive(body),
        keySlotUsed,
      });
    } catch (err) {
      const mapped = mapGeminiApiError(
        err,
        'Gagal menyusun detail rencana cerita Alkitab 3D Lantai 2.'
      );
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  // =========================================================================
  // LANTAI 3: RISET FAKTA ALKITAB, BUKTI PENINGGALAN & KATA IBRANI/YUNANI (GOOGLE SEARCH + MASTER TB)
  // =========================================================================
  app.post('/api/bible-facts/research', async (req, res) => {
    const body = req.body as { category?: BibleFactCategory; topicHint?: string };
    const category: BibleFactCategory =
      body?.category === 'archaeology' ||
      body?.category === 'hebrew_greek' ||
      body?.category === 'mystery' ||
      body?.category === 'all'
        ? body.category
        : 'all';
    const catMeta =
      BIBLE_FACT_CATEGORIES.find((c) => c.id === category) ?? BIBLE_FACT_CATEGORIES[0];
    const topicHint = String(body?.topicHint ?? '').trim().slice(0, 180);

    const biblePolicy = { policyBlock: getMasterBibleContext(body) };

    const systemInstruction = `Kamu adalah Tim Riset Fakta Alkitab & Misteri di Lantai 3 (Bible Facts & Mysteries).
Tugasmu mencari fakta Alkitab yang akurat, bertanggung jawab, dan jarang diketahui orang, mencakup:
1. Bukti peninggalan arkeologi, prasasti, situs sejarah, atau manuskrip kuno yang terverifikasi secara akademis/sejarah.
2. Kata bahasa asli Ibrani (Perjanjian Lama) dan/atau Yunani (Perjanjian Baru) yang sering salah diartikan oleh orang modern, lengkap dengan transliterasi, kesalahpahaman umum, dan arti aslinya dalam konteks Alkitab.
3. Misteri atau detail tersembunyi di dalam Alkitab yang menarik tanpa sensasionalisme, tanpa teori konspirasi, dan 100% setia pada Alkitab Terjemahan Baru.
4. Durasi video target MAKSIMAL 2 menit 50 detik (170 detik = 17 adegan × 10 detik) dengan arahan visual animasi yang bentuknya MENYERUPAI bukti peninggalan, situs kuno, atau gulungan manuskrip yang diriset.

${biblePolicy.policyBlock}

Kembalikan HANYA JSON valid (tanpa markdown codefence):
{
  "title": string,
  "bibleReference": string,
  "evidenceType": string,
  "originalTerm": string,
  "transliteration": string,
  "commonMisconception": string,
  "trueMeaning": string,
  "archaeologicalEvidence": string,
  "coreSummary": string,
  "visualReconstructionBrief": string,
  "recommendedCommand": string
}`;

    const userPrompt = topicHint
      ? `Kategori Riset: ${catMeta.label}. Telusuri secara faktual topik: "${topicHint}". Sertakan bukti peninggalan arkeologi dan/atau kupasan kata Ibrani/Yunani yang relevan, rujukan ayat Alkitab Terjemahan Baru, serta arahan visual animasi menyerupai objek riset untuk video dokumenter maksimal 2 menit 50 detik (17 adegan × 10 detik).`
      : `Kategori Riset: ${catMeta.label}. Pilihkan 1 topik fakta & misteri Alkitab yang sangat menarik, terverifikasi secara sejarah/bahasa asli Ibrani atau Yunani, berlandaskan Alkitab Terjemahan Baru, dan siap diproduksi maksimal 2 menit 50 detik (17 adegan × 10 detik).`;

    try {
      const { ai, keySlotUsed } = createGeminiClientWithMeta('bible-facts-mysteries');
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawText = (response.text ?? '').trim();
      const stripped = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const sIdx = stripped.indexOf('{');
      const eIdx = stripped.lastIndexOf('}');
      const parsed = JSON.parse(
        sIdx !== -1 && eIdx > sIdx ? stripped.slice(sIdx, eIdx + 1) : stripped
      ) as Record<string, unknown>;

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sourceLinks: Array<{ title: string; uri: string }> = [];
      const seen = new Set<string>();
      for (const ch of chunks) {
        const uri = ch.web?.uri;
        const title = ch.web?.title;
        if (uri && !seen.has(uri)) {
          seen.add(uri);
          sourceLinks.push({ title: title || uri, uri });
        }
      }

      const bibleReference = String(parsed.bibleReference ?? '2 Samuel 7:12-16').trim();
      const matchedMasterVerses = getMasterBibleVerses(body, bibleReference).slice(0, 4);

      const title = String(parsed.title ?? `Fakta Alkitab: ${topicHint || catMeta.label}`).trim();
      const visualReconstructionBrief =
        String(parsed.visualReconstructionBrief ?? '').trim() ||
        'Rekonstruksi visual dokumenter menyerupai artefak batu kuno, peta Timur Tengah Kuno, dan gulungan manuskrip Ibrani/Yunani.';

      const recommendedCommand =
        String(parsed.recommendedCommand ?? '').trim() ||
        `Produksi video dokumenter Bible Facts & Mysteries maksimal 2 menit 50 detik (17 adegan × 10 detik) tentang "${title}" (${bibleReference}) berdasarkan Master Alkitab Terjemahan Baru. Sajikan bukti peninggalan & kupasan kata asli secara faktual dengan animasi visual yang menyerupai: ${visualReconstructionBrief}.`;

      res.json({
        category,
        categoryLabel: catMeta.label,
        title,
        bibleReference,
        evidenceType: String(parsed.evidenceType ?? catMeta.label).trim(),
        originalTerm: String(parsed.originalTerm ?? '').trim() || undefined,
        transliteration: String(parsed.transliteration ?? '').trim() || undefined,
        commonMisconception: String(parsed.commonMisconception ?? '').trim() || undefined,
        trueMeaning: String(parsed.trueMeaning ?? '').trim() || undefined,
        archaeologicalEvidence:
          String(parsed.archaeologicalEvidence ?? '').trim() ||
          'Didukung konteks historis dan catatan teks Alkitab Terjemahan Baru.',
        coreSummary: String(parsed.coreSummary ?? '').trim(),
        visualReconstructionBrief,
        recommendedCommand,
        sourceLinks: sourceLinks.slice(0, 5),
        matchedMasterVerses,
        masterBibleActive: isMasterBibleActive(body),
        keySlotUsed,
      });
    } catch (err) {
      const mapped = mapGeminiApiError(
        err,
        'Gagal menjalankan riset fakta, arkeologi & bahasa asli Alkitab di Lantai 3.'
      );
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  app.post('/api/pipeline/plan-and-script', async (req, res) => {
    const body = req.body as {
      channelId?: ShortsChannelId;
      command?: string;
      bookScope?: string;
      durationSeconds?: ShortsDuration;
      sceneCount?: PipelineSceneCount;
      animationMode?: 'keyframe_to_video' | 'keyframe_kenburns';
      generateAudio?: boolean;
      channelTemplate?: Record<string, unknown>;
      providerConfig?: unknown;
    };

    const validated = validateOneCommandInput(body ?? {});
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const input = validated.value;
    const channel = getChannelById(input.channelId);
    const blueprint = getChannelWorkflowBlueprint(input.channelId);
    const wordBudget = computeScriptWordBudget(input.durationSeconds);
    const providerCfg = mergeProviderConfig(body?.providerConfig);

    const templateDirective =
      body?.channelTemplate && typeof body.channelTemplate === 'object'
        ? formatTemplatePromptDirectives(body.channelTemplate as never)
        : '';

    const serverBiblePolicy = { policyBlock: getMasterBibleContext(body) };
    const isDailyFaithLongDevotional =
      input.channelId === 'daily-faith-inspiration' && input.durationSeconds === 170;
    const isBibleStoriesChapter = input.channelId === 'bible-stories-3d';
    const isBibleFactsChannel = input.channelId === 'bible-facts-mysteries';

    const channelSpecificDirective = isDailyFaithLongDevotional
      ? `KHUSUS LANTAI 1 (DAILY FAITH & INSPIRATION — 2 MENIT 50 DETIK): Tulis renungan harian yang utuh, hangat, menenangkan, dan memberkati sepanjang ~2 menit 50 detik (${wordBudget.minWords}-${wordBudget.maxWords} kata) dengan struktur: sapaan & ayat Terjemahan Baru -> renungan mendalam berbasis sumber valid -> aplikasi iman hari ini -> doa berkat penutup. Pastikan keyframePrompt & animationPrompt pada setiap adegan menggambarkan ANIMASI LATAR ATMOSFERIK LEMBUT yang 100% selaras dengan suasana & pesan teks renungan yang sedang dibacakan (tanpa teks tertulis di dalam gambar).`
      : isBibleStoriesChapter
      ? `KHUSUS LANTAI 2 (BIBLE STORIES 3D — 1 PASAL = 1 CERITA · ${input.sceneCount} ADEGAN × ${Math.round(
          input.durationSeconds / input.sceneCount
        )} DETIK):
  - Wajib fokus pada 1 PASAL PENUH sebagai 1 cerita utuh (walaupun kisahnya masih bersambung ke pasal berikutnya, akhiri dengan jembatan lembut menuju pasal berikutnya).
  - Masukkan SELURUH PERCAKAPAN / DIALOG TOKOH di pasal tersebut langsung ke dalam "fullNarrationScript" dan "narrationText" per adegan (dengan intonasi naratif siap dibacakan audio narasi MP3).
  - Setiap adegan berdurasi sekitar ${Math.round(
    input.durationSeconds / input.sceneCount
  )} detik agar ritme visual 3D sinematik ramah keluarga tepat sesuai timestamp.
  - Tulis keyframePrompt & animationPrompt dalam Bahasa Inggris deskriptif yang sangat konsisten (karakter 3D, busana, pencahayaan hangat yang sama dari adegan 1 sampai ${input.sceneCount}, tanpa teks tertulis di dalam gambar).`
      : isBibleFactsChannel
      ? `KHUSUS LANTAI 3 (BIBLE FACTS & MYSTERIES — MAKS 2 MENIT 50 DETIK · ${input.sceneCount} ADEGAN × ${Math.round(
          input.durationSeconds / input.sceneCount
        )} DETIK):
  - Kupas fakta Alkitab yang jarang diketahui: bukti peninggalan arkeologi, situs bersejarah, dan/atau makna asli kata bahasa Ibrani & Yunani yang sering disalahartikan, 100% faktual dan setia pada Master Alkitab Terjemahan Baru tanpa spekulasi liar.
  - Tulis keyframePrompt & animationPrompt dalam Bahasa Inggris bergaya dokumenter sejarah yang BENTUK VISUALNYA MENYERUPAI objek yang sedang diriset (artefak kuno, prasasti batu, gulungan manuskrip Ibrani/Yunani, rekonstruksi lokasi Alkitab, tanpa teks modern/watermark di dalam gambar).`
      : `Untuk keyframePrompt dan animationPrompt, tulis dalam Bahasa Inggris deskriptif yang sangat konsisten (tanpa teks tertulis di dalam gambar).`;

    const systemInstruction = `Kamu adalah Orkestrator Produksi YouTube untuk channel "${channel.name}" (${channel.focus}).
Tugasmu menjalankan Tahap 1 (Rencana Cerita/Riset), Tahap 2 (Jalan Cerita & Naskah Lengkap termasuk Percakapan untuk Audio), dan Tahap 3 (Pemecahan Timestamp Adegan & Arahan Gambar Patokan + Animasi) secara utuh dalam satu respons JSON valid.

${serverBiblePolicy.policyBlock}

ATURAN PENTING:
1. Bahasa narasi, rencana, dan metadata YouTube HARUS Bahasa Indonesia alami, menyentuh, akurat secara Alkitab Terjemahan Baru, tidak menghakimi, dan tidak mengarang ayat Alkitab.
2. ${channelSpecificDirective}
3. Jumlah adegan HARUS tepat ${input.sceneCount} adegan dengan total durasi ${input.durationSeconds} detik (${Math.round(
      input.durationSeconds / input.sceneCount
    )} detik per adegan).
4. Target panjang naskah penuh: ${wordBudget.minWords}-${wordBudget.maxWords} kata.
${templateDirective ? `\nARAHAN TEMPLATE CHANNEL:\n${templateDirective}\n` : ''}
Kembalikan HANYA JSON valid (tanpa markdown codefence) dengan skema persis berikut:
{
  "storyPlan": {
    "seriesTitle": string,
    "episodeTitle": string,
    "bookOrScope": string,
    "sequencePosition": string,
    "coreMessage": string,
    "bibleReferences": string[],
    "storyBeats": string[]
  },
  "scriptArc": {
    "hook": string,
    "bodySummary": string,
    "closingCta": string,
    "fullNarrationScript": string
  },
  "scenes": [
    {
      "sceneNumber": number,
      "narrationText": string,
      "visualDescription": string,
      "keyframePrompt": string,
      "animationPrompt": string,
      "cameraMotion": string
    }
  ],
  "youtubeMetadata": {
    "seoTitle": string,
    "description": string,
    "hashtags": string[]
  }
}`;

    const userPrompt = `Channel Target: ${channel.name} (${channel.id})
Alur Channel: ${blueprint.workflowTitle}
Cakupan Kitab / Seri: ${input.bookScope || blueprint.defaultBookScope}
Durasi Target: ${input.durationSeconds} detik (${input.sceneCount} adegan)
Perintah Pemilik Studio: ${input.command}`;

    const executionOrder = resolveLlmExecutionOrder(providerCfg);
    let rawJson: Record<string, unknown> | null = null;
    let providerUsed = 'gemini';
    let keySlotUsed = resolveChannelKeySlot(input.channelId).geminiEnvVar;
    let lastError: unknown = null;

    for (const provider of executionOrder) {
      if (provider === 'ollama' && providerCfg.ollama.connectionMode === 'proxy') {
        try {
          const text = await callOllamaChat({
            baseUrl: providerCfg.ollama.baseUrl,
            model: providerCfg.ollama.model,
            systemInstruction,
            userPrompt,
            timeoutMs: 45000,
          });
          const stripped = text
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
          const start = stripped.indexOf('{');
          const end = stripped.lastIndexOf('}');
          rawJson = JSON.parse(start !== -1 && end > start ? stripped.slice(start, end + 1) : stripped);
          providerUsed = `ollama (${providerCfg.ollama.model})`;
          keySlotUsed = 'OLLAMA_LOCAL';
          break;
        } catch (err) {
          lastError = err;
          if (providerCfg.llmRouting === 'ollama') break;
        }
      }

      if (provider === 'gemini') {
        try {
          const resolved = resolveGeminiKeyForChannel(input.channelId);
          keySlotUsed = resolved.keySlotUsed;
          rawJson = await generateGeminiJson<Record<string, unknown>>(
            userPrompt,
            systemInstruction,
            input.channelId
          );
          providerUsed = 'gemini';
          break;
        } catch (err) {
          lastError = err;
        }
      }
    }

    if (!rawJson) {
      const mapped = mapGeminiApiError(
        lastError,
        'Gagal menyusun rencana cerita, naskah, dan timestamp adegan.'
      );
      res.status(mapped.statusCode).json({ error: mapped.message });
      return;
    }

    const rawPlan = (rawJson.storyPlan ?? {}) as Record<string, unknown>;
    const rawScript = (rawJson.scriptArc ?? {}) as Record<string, unknown>;
    const rawMeta = (rawJson.youtubeMetadata ?? {}) as Record<string, unknown>;
    const rawScenes = Array.isArray(rawJson.scenes)
      ? (rawJson.scenes as RawSceneBlueprint[])
      : [];

    const scenes = normalizeTimestampedScenes(rawScenes, input.durationSeconds, input.sceneCount);
    const srtText = buildPipelineSrt(scenes);

    const fullScript =
      String(rawScript.fullNarrationScript ?? '').trim() ||
      scenes.map((s) => s.narrationText).join(' ');
    const extractedRefs = extractIndonesianBibleReferences(
      `${input.bookScope} ${input.command} ${fullScript}`
    );
    const planRefs = normalizeStringArray(rawPlan.bibleReferences);
    const bibleReferences = Array.from(new Set([...planRefs, ...extractedRefs])).slice(0, 8);

    const storyPlan = {
      seriesTitle: String(rawPlan.seriesTitle ?? blueprint.workflowTitle).trim(),
      episodeTitle: String(rawPlan.episodeTitle ?? input.command.slice(0, 72)).trim(),
      bookOrScope: String(rawPlan.bookOrScope ?? (input.bookScope || blueprint.defaultBookScope)).trim(),
      sequencePosition: String(rawPlan.sequencePosition ?? 'Episode 1 — Seri Kanon').trim(),
      coreMessage:
        String(rawPlan.coreMessage ?? '').trim() ||
        'Menyampaikan pesan firman Tuhan secara setia, hangat, dan mudah dipahami.',
      bibleReferences,
      storyBeats:
        normalizeStringArray(rawPlan.storyBeats).length > 0
          ? normalizeStringArray(rawPlan.storyBeats).slice(0, 6)
          : scenes.map((s) => `Adegan ${s.sceneNumber}: ${s.narrationText.slice(0, 90)}`),
    };

    const scriptArc = {
      hook: String(rawScript.hook ?? scenes[0]?.narrationText ?? '').trim(),
      bodySummary: String(rawScript.bodySummary ?? storyPlan.coreMessage).trim(),
      closingCta:
        String(rawScript.closingCta ?? '').trim() ||
        'Bagikan renungan ini kepada orang terdekat yang membutuhkan penguatan hari ini.',
      fullNarrationScript: fullScript,
      estimatedWordCount: fullScript.split(/\s+/).filter(Boolean).length,
    };

    const youtubeMetadata = {
      seoTitle: String(rawMeta.seoTitle ?? storyPlan.episodeTitle).trim().slice(0, 100),
      description:
        String(rawMeta.description ?? '').trim() ||
        `${storyPlan.coreMessage}\n\nReferensi: ${bibleReferences.join(', ') || storyPlan.bookOrScope}`,
      hashtags:
        normalizeStringArray(rawMeta.hashtags).length > 0
          ? normalizeStringArray(rawMeta.hashtags).slice(0, 8)
          : ['#Shorts', '#Alkitab', '#ImanKristen'],
      madeForKids: channel.madeForKids,
      targetChannelName: channel.name,
    };

    res.json({
      storyPlan,
      scriptArc,
      scenes,
      srtText,
      youtubeMetadata,
      keySlotUsed,
      providerUsed,
      createdAt: new Date().toISOString(),
    });
  });

  app.post('/api/pipeline/scene-keyframe', async (req, res) => {
    const body = req.body as {
      channelId?: ShortsChannelId;
      prompt?: string;
      referenceImageDataUrl?: string;
    };

    const channelId = body?.channelId;
    if (
      channelId !== 'bible-stories-3d' &&
      channelId !== 'daily-faith-inspiration' &&
      channelId !== 'bible-facts-mysteries'
    ) {
      res.status(400).json({ error: 'channelId tidak valid.' });
      return;
    }

    const prompt = String(body?.prompt ?? '').trim();
    if (prompt.length < 6 || prompt.length > 1200) {
      res.status(400).json({ error: 'Prompt gambar patokan harus 6–1200 karakter.' });
      return;
    }

    try {
      const { ai, keySlotUsed } = createGeminiClientWithMeta(channelId);
      const refImage = parseBase64DataUrl(
        body?.referenceImageDataUrl,
        ['image/png', 'image/jpeg', 'image/webp'],
        10 * 1024 * 1024
      );

      const parts: Array<
        { text: string } | { inlineData: { data: string; mimeType: string } }
      > = refImage
        ? [
            {
              inlineData: {
                data: refImage.base64,
                mimeType: refImage.mimeType,
              },
            },
            {
              text: `Keep the exact same character design, art style, and color grading as the reference keyframe image. Generate the next 9:16 vertical cinematic scene without any text overlays: ${prompt}`,
            },
          ]
        : [
            {
              text: `Vertical 9:16 cinematic frame, clean composition with zero embedded text or watermarks: ${prompt}`,
            },
          ];

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: '9:16',
          },
        },
      });

      let imageData: string | undefined;
      let mimeType = 'image/png';
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          imageData = part.inlineData.data;
          if (part.inlineData.mimeType) mimeType = part.inlineData.mimeType;
          break;
        }
      }

      if (!imageData) {
        res.status(502).json({
          error: 'Model gambar tidak mengembalikan gambar patokan untuk adegan ini.',
        });
        return;
      }

      res.json({
        dataUrl: `data:${mimeType};base64,${imageData}`,
        mimeType,
        keySlotUsed,
        modelUsed: 'gemini-3.1-flash-lite-image',
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      const mapped = mapGeminiApiError(
        err,
        'Gagal membuat gambar patokan adegan (gemini-3.1-flash-lite-image).'
      );
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  app.post('/api/pipeline/scene-animate', async (req, res) => {
    const body = req.body as {
      channelId?: ShortsChannelId;
      animationPrompt?: string;
      keyframeDataUrl?: string;
      durationSec?: number;
    };

    const channelId = body?.channelId;
    if (
      channelId !== 'bible-stories-3d' &&
      channelId !== 'daily-faith-inspiration' &&
      channelId !== 'bible-facts-mysteries'
    ) {
      res.status(400).json({ error: 'channelId tidak valid.' });
      return;
    }

    const animationPrompt = String(body?.animationPrompt ?? '').trim();
    if (animationPrompt.length < 6 || animationPrompt.length > 1000) {
      res.status(400).json({ error: 'Prompt animasi adegan harus 6–1000 karakter.' });
      return;
    }

    const keyframe = parseBase64DataUrl(
      body?.keyframeDataUrl,
      ['image/png', 'image/jpeg', 'image/webp'],
      10 * 1024 * 1024
    );
    if (!keyframe) {
      res.status(400).json({ error: 'Gambar patokan (keyframe) valid wajib disertakan sebelum animasi.' });
      return;
    }

    const clampedSec = Math.max(3, Math.min(15, Math.round(Number(body?.durationSec) || 8)));

    try {
      const { ai, keySlotUsed } = createGeminiClientWithMeta(channelId);
      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: [
            {
              type: 'image',
              mime_type: keyframe.mimeType,
              data: keyframe.base64,
            },
            {
              type: 'text',
              text: animationPrompt,
            },
          ],
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: '9:16',
            duration: `${clampedSec}s`,
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
          error: 'Model animasi video tidak mengembalikan klip MP4 untuk adegan ini.',
        });
        return;
      }

      res.json({
        dataUrl: `data:${mimeType};base64,${videoData}`,
        mimeType,
        durationSec: clampedSec,
        keySlotUsed,
        modelUsed: 'gemini-omni-1.2-flash',
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      const mapped = mapGeminiApiError(
        err,
        'Gagal menganimasikan gambar patokan dengan gemini-omni-1.2-flash.'
      );
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  app.post('/api/pipeline/narration-audio', async (req, res) => {
    const body = req.body as {
      channelId?: ShortsChannelId;
      text?: string;
      voiceId?: string;
      modelId?: string;
      stability?: number;
      similarityBoost?: number;
    };

    const channelId = body?.channelId;
    const slot =
      channelId && channelId in CHANNEL_KEY_ROUTING
        ? resolveChannelKeySlot(channelId)
        : undefined;
    const resolvedKey = resolveElevenLabsKeyForChannel(channelId);
    if (!resolvedKey) {
      res.status(503).json({
        error: `Kunci ElevenLabs (${slot?.elevenLabsEnvVar ?? 'ELEVENLABS_API_KEY'} atau ELEVENLABS_API_KEY) belum terpasang di Settings > Secrets.`,
      });
      return;
    }

    const validated = validateElevenLabsTtsRequest({
      text: body?.text,
      voiceId: body?.voiceId || slot?.voicePresetId || '21m00Tcm4TlvDq8ikWAM',
      modelId: body?.modelId || 'eleven_multilingual_v2',
      stability: body?.stability ?? 0.55,
      similarityBoost: body?.similarityBoost ?? 0.75,
    });
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const { text, voiceId, modelId, stability, similarityBoost } = validated.value;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': resolvedKey.apiKey,
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
              ? `Kunci ${resolvedKey.keySlotUsed} ditolak oleh ElevenLabs.`
              : response.status === 429
              ? 'Kuota ElevenLabs tercapai untuk kunci ini.'
              : `ElevenLabs TTS gagal (HTTP ${response.status}).`,
        });
        return;
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      res.json({
        dataUrl: `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`,
        mimeType: 'audio/mpeg',
        keySlotUsed: resolvedKey.keySlotUsed,
        charCount: text.length,
        createdAt: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        error: 'Gagal menghubungi ElevenLabs untuk sintesis narasi.',
      });
    } finally {
      clearTimeout(timer);
    }
  });

  // =========================================================================
  // QC TAHAP 1: CEK KECOCOKAN AUDIO & VIDEO PER ADEGAN (SEBELUM PENYATUAN EDITOR)
  // =========================================================================
  app.post('/api/pipeline/av-sync-check', async (req, res) => {
    const body = req.body as {
      channelId?: ShortsChannelId;
      scenes?: PipelineSceneItem[];
      hasNarrationAudio?: boolean;
      expectedDurationSec?: number;
    };

    const channelId = body?.channelId;
    if (
      channelId !== 'bible-stories-3d' &&
      channelId !== 'daily-faith-inspiration' &&
      channelId !== 'bible-facts-mysteries'
    ) {
      res.status(400).json({ error: 'channelId tidak valid untuk QC Tahap 1 Audio-Video.' });
      return;
    }

    const scenes = Array.isArray(body?.scenes) ? body.scenes : [];
    const expectedDurationSec = Math.max(10, Math.round(Number(body?.expectedDurationSec) || 170));
    const localReport = evaluateLocalAvSyncCheck({
      scenes,
      hasNarrationAudio: Boolean(body?.hasNarrationAudio),
      expectedDurationSec,
    });

    res.json({
      report: localReport,
      keySlotUsed: resolveGeminiKeyForChannel(channelId).keySlotUsed,
    });
  });

  app.post('/api/pipeline/assemble-video', express.json({ limit: '120mb' }), async (req, res) => {
    const hasFfmpeg = await checkFfmpegAvailable();
    if (!hasFfmpeg) {
      res.status(503).json({
        error: 'FFmpeg tidak tersedia pada server untuk menggabungkan video final.',
      });
      return;
    }

    const body = req.body as {
      scenes?: Array<{
        sceneNumber?: number;
        durationSec?: number;
        videoDataUrl?: string;
        keyframeDataUrl?: string;
      }>;
      audioDataUrl?: string;
    };

    if (!Array.isArray(body?.scenes) || body.scenes.length === 0 || body.scenes.length > 20) {
      res.status(400).json({ error: 'Sertakan 1 sampai 20 adegan untuk digabungkan menjadi video final.' });
      return;
    }

    const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kantor-ai-assemble-'));
    try {
      const clipPaths: string[] = [];
      let totalDurationSec = 0;

      for (let i = 0; i < body.scenes.length; i++) {
        const scene = body.scenes[i];
        const durSec = Math.max(2, Math.min(35, Math.round(Number(scene.durationSec) || 10)));
        totalDurationSec += durSec;

        const outClip = path.join(tmpDir, `clip_${i}.mp4`);
        const videoMedia = parseBase64DataUrl(
          scene.videoDataUrl,
          ['video/mp4', 'video/webm'],
          25 * 1024 * 1024
        );
        const imageMedia = parseBase64DataUrl(
          scene.keyframeDataUrl,
          ['image/png', 'image/jpeg', 'image/webp'],
          10 * 1024 * 1024
        );

        if (videoMedia) {
          const ext = videoMedia.mimeType === 'video/webm' ? 'webm' : 'mp4';
          const rawIn = path.join(tmpDir, `raw_${i}.${ext}`);
          await fsPromises.writeFile(rawIn, videoMedia.buffer);

          await execFileAsync(
            'ffmpeg',
            [
              '-y',
              '-stream_loop',
              '-1',
              '-i',
              rawIn,
              '-t',
              String(durSec),
              '-vf',
              'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=24',
              '-an',
              '-c:v',
              'libx264',
              '-preset',
              'ultrafast',
              '-pix_fmt',
              'yuv420p',
              outClip,
            ],
            { timeout: 60000 }
          );
          clipPaths.push(outClip);
        } else if (imageMedia) {
          const ext =
            imageMedia.mimeType === 'image/jpeg'
              ? 'jpg'
              : imageMedia.mimeType === 'image/webp'
              ? 'webp'
              : 'png';
          const rawImg = path.join(tmpDir, `img_${i}.${ext}`);
          await fsPromises.writeFile(rawImg, imageMedia.buffer);

          const frames = durSec * 24;
          // Alternate gentle zoom-in / zoom-out per scene for dynamic 9:16 motion
          const zoomExpr =
            i % 2 === 0
              ? `min(zoom+0.0007,1.08)`
              : `if(lte(on,1),1.08,max(1.0,zoom-0.0007))`;
          await execFileAsync(
            'ffmpeg',
            [
              '-y',
              '-loop',
              '1',
              '-i',
              rawImg,
              '-vf',
              `scale=900:1600:force_original_aspect_ratio=increase,crop=900:1600,zoompan=z='${zoomExpr}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=720x1280:fps=24,format=yuv420p`,
              '-t',
              String(durSec),
              '-c:v',
              'libx264',
              '-preset',
              'ultrafast',
              '-pix_fmt',
              'yuv420p',
              outClip,
            ],
            { timeout: 60000 }
          );
          clipPaths.push(outClip);
        } else {
          res.status(400).json({
            error: `Adegan ${i + 1} belum memiliki gambar patokan atau klip animasi yang valid.`,
          });
          return;
        }
      }

      const concatListPath = path.join(tmpDir, 'concat.txt');
      const concatContent = clipPaths.map((p) => `file '${p.replace(/'/g, '')}'`).join('\n');
      await fsPromises.writeFile(concatListPath, concatContent, 'utf8');

      const mergedVideoPath = path.join(tmpDir, 'merged_video.mp4');
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          concatListPath,
          '-c',
          'copy',
          mergedVideoPath,
        ],
        { timeout: 60000 }
      );

      const finalOutputPath = path.join(tmpDir, 'final_shorts.mp4');
      const audioMedia = parseBase64DataUrl(
        body?.audioDataUrl,
        ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/mp4'],
        15 * 1024 * 1024
      );

      if (audioMedia) {
        const audioPath = path.join(tmpDir, 'narration.mp3');
        await fsPromises.writeFile(audioPath, audioMedia.buffer);
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-i',
            mergedVideoPath,
            '-i',
            audioPath,
            '-map',
            '0:v:0',
            '-map',
            '1:a:0',
            '-c:v',
            'copy',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-shortest',
            '-movflags',
            '+faststart',
            finalOutputPath,
          ],
          { timeout: 60000 }
        );
      } else {
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-i',
            mergedVideoPath,
            '-map',
            '1:v:0',
            '-map',
            '0:a:0',
            '-c:v',
            'copy',
            '-c:a',
            'aac',
            '-shortest',
            '-movflags',
            '+faststart',
            finalOutputPath,
          ],
          { timeout: 60000 }
        );
      }

      const finalBuffer = await fsPromises.readFile(finalOutputPath);
      res.json({
        dataUrl: `data:video/mp4;base64,${finalBuffer.toString('base64')}`,
        mimeType: 'video/mp4',
        totalDurationSec,
        sceneCount: clipPaths.length,
        hasAudio: Boolean(audioMedia),
        fileSizeBytes: finalBuffer.length,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('FFmpeg assembly error:', err instanceof Error ? err.message : err);
      res.status(500).json({
        error:
          'Gagal menggabungkan adegan menjadi 1 video MP4. Pastikan gambar patokan atau klip video setiap adegan valid lalu coba lagi.',
      });
    } finally {
      await fsPromises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  app.post('/api/pipeline/final-qc', async (req, res) => {
    const body = req.body as {
      channelId?: ShortsChannelId;
      storyPlan?: Record<string, unknown>;
      scriptArc?: Record<string, unknown>;
      scenes?: Array<Partial<PipelineSceneItem>>;
      youtubeMetadata?: Record<string, unknown>;
      hasAudio?: boolean;
      hasAssembledVideo?: boolean;
      assembledDurationSec?: number;
    };

    const channelId = body?.channelId;
    if (
      channelId !== 'bible-stories-3d' &&
      channelId !== 'daily-faith-inspiration' &&
      channelId !== 'bible-facts-mysteries'
    ) {
      res.status(400).json({ error: 'channelId tidak valid untuk Quality Control akhir.' });
      return;
    }

    const channel = getChannelById(channelId);
    const scenesSummary = Array.isArray(body?.scenes)
      ? body.scenes.map((s, idx) => ({
          sceneNumber: s.sceneNumber ?? idx + 1,
          timecodeLabel: s.timecodeLabel ?? '',
          durationSec: s.durationSec ?? 0,
          narrationText: String(s.narrationText ?? '').slice(0, 260),
          hasKeyframe: Boolean(s.keyframeStatus === 'completed'),
          hasAnimation: Boolean(s.animationStatus === 'completed'),
        }))
      : [];

    const qcBiblePolicy = { policyBlock: getMasterBibleContext(body) };
    const systemInstruction = `Kamu adalah Tim Quality Control Akhir (Theological Guardian + Pastoral Sensitivity Checker + SEO Publisher) untuk channel "${channel.name}".
Audit kesesuaian hasil akhir produksi terhadap rencana cerita/renungan Alkitab awal, kesetiaan mutlak pada Alkitab Terjemahan Baru (TB), naskah ber-timestamp, kelengkapan adegan visual/audio, dan metadata YouTube.

${qcBiblePolicy.policyBlock}

Kembalikan HANYA JSON valid:
{
  "verdict": "LULUS" | "PERLU REVISI" | "DITOLAK",
  "planAlignmentScore": number,
  "scriptMatch": boolean,
  "theologicalPassed": boolean,
  "pastoralPassed": boolean,
  "summary": string,
  "checks": [
    { "id": string, "label": string, "passed": boolean, "note": string }
  ],
  "revisionItems": string[]
}`;

    const prompt = `Channel: ${channel.name} (${channel.focus})
Rencana Cerita Awal: ${JSON.stringify(body?.storyPlan ?? {})}
Naskah Final: ${JSON.stringify(body?.scriptArc ?? {})}
Daftar Adegan & Status Visual: ${JSON.stringify(scenesSummary)}
Audio Narasi Tersedia: ${Boolean(body?.hasAudio)}
Video Final MP4 Tergabung: ${Boolean(body?.hasAssembledVideo)} (durasi ${Number(body?.assembledDurationSec) || 0} detik)
Metadata YouTube: ${JSON.stringify(body?.youtubeMetadata ?? {})}

Periksa 6 aspek wajib di array "checks":
1. Keselarasan Rencana Cerita Alkitab
2. Akurasi Ayat & Doktrin (Theological Guardian)
3. Kepekaan Pastoral & Nada Bahasa (Pastoral Checker)
4. Sinkronisasi Timestamp Narasi vs Adegan
5. Kelengkapan Visual & Video Final Tergabung
6. Kesiapan Metadata & Kebijakan Channel YouTube`;

    try {
      const resolved = resolveGeminiKeyForChannel(channelId);
      const raw = await generateGeminiJson<Record<string, unknown>>(
        prompt,
        systemInstruction,
        channelId
      );

      const verdict = normalizeVerdict(raw.verdict);
      const scoreRaw = Number(raw.planAlignmentScore);
      const planAlignmentScore = Number.isFinite(scoreRaw)
        ? Math.max(0, Math.min(100, Math.round(scoreRaw)))
        : verdict === 'LULUS'
        ? 90
        : 65;
      const scriptMatch = raw.scriptMatch !== false;
      const theologicalPassed = raw.theologicalPassed !== false && verdict !== 'DITOLAK';
      const pastoralPassed = raw.pastoralPassed !== false && verdict !== 'DITOLAK';

      const checks: FinalQcCheckItem[] = Array.isArray(raw.checks)
        ? raw.checks.slice(0, 8).map((c, idx) => {
            const obj = (c ?? {}) as Record<string, unknown>;
            return {
              id: String(obj.id ?? `check_${idx + 1}`),
              label: String(obj.label ?? `Pemeriksaan ${idx + 1}`).trim(),
              passed: Boolean(obj.passed),
              note: String(obj.note ?? '').trim(),
            };
          })
        : [];

      const readyGate =
        Boolean(body?.hasAssembledVideo) &&
        evaluateFinalQcGate({
          verdict,
          planAlignmentScore,
          scriptMatch,
          theologicalPassed,
          pastoralPassed,
        });

      const report: FinalQcReport = {
        verdict,
        planAlignmentScore,
        scriptMatch,
        theologicalPassed,
        pastoralPassed,
        readyForYoutubeUpload: readyGate,
        summary:
          String(raw.summary ?? '').trim() ||
          (readyGate
            ? 'Seluruh tahapan produksi selaras dengan rencana cerita awal dan lulus QC akhir.'
            : 'Perlu melengkapi atau merevisi item QC sebelum diunggah ke YouTube.'),
        checks,
        revisionItems: normalizeStringArray(raw.revisionItems).slice(0, 6),
        checkedAt: new Date().toISOString(),
      };

      res.json({
        report,
        keySlotUsed: resolved.keySlotUsed,
      });
    } catch (err) {
      const mapped = mapGeminiApiError(err, 'Gagal menjalankan Quality Control akhir.');
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  app.get('/api/pwa/remote-version', async (_req, res) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const upstream = await fetch(`https://officecontent.netlify.app/version.json?t=${Date.now()}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (upstream.ok) {
        const contentType = upstream.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = (await upstream.json()) as Record<string, unknown>;
          if (typeof data.version === 'string' && typeof data.buildId === 'string') {
            res.json({ reachable: true, payload: data });
            return;
          }
        }
      }
      res.json({ reachable: false, payload: null });
    } catch {
      res.json({ reachable: false, payload: null });
    } finally {
      clearTimeout(timer);
    }
  });

  // Ensure /api/* body-parser errors (e.g., 413 PayloadTooLargeError or malformed JSON) always return JSON
  app.use(
    (
      err: { status?: number; type?: string; message?: string },
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (!req.path.startsWith('/api/')) {
        next(err);
        return;
      }
      if (err?.type === 'entity.too.large' || err?.status === 413) {
        res.status(413).json({
          error: 'Ukuran file Master Alkitab melebihi batas pengiriman server (maks. 50 MB).',
        });
        return;
      }
      if (err?.status === 400) {
        res.status(400).json({
          error: 'Format JSON permintaan tidak valid.',
        });
        return;
      }
      res.status(err?.status ?? 500).json({
        error: err?.message || 'Terjadi kendala pada server API.',
      });
    }
  );

  return app;
}

async function startServer() {
  const app = createApiApp();

  if (!isProduction) {
    // Dynamic specifier prevents Netlify's esbuild bundler from pulling Vite into the serverless function bundle
    const vitePkg = 'vite';
    const { createServer: createViteServer } = await import(vitePkg);
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });

    // Vite 8 still injects /@vite/client in middlewareMode with a fallback WebSocket on port 24678,
    // which fails through HTTPS reverse proxies with "WebSocket closed without opened."
    // Serve a clean no-WebSocket client shim that preserves CSS injection and HMR context APIs.
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(`
const sheetsMap = new Map();
let lastInsertedStyle;

export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement('afterend', style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}

export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}

export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}

export function injectQuery(url) {
  return url;
}

export class ErrorOverlay extends HTMLElement {}
`);
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

const isServerlessRuntime = Boolean(
  process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME
);
const isDirectMainExecution =
  !isServerlessRuntime &&
  typeof process !== 'undefined' &&
  typeof process.argv?.[1] === 'string' &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectMainExecution) {
  startServer().catch((err) => {
    console.error('Failed to start Kantor AI 3D server:', err);
    process.exit(1);
  });
}
