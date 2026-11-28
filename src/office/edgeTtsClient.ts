import { auth } from '../firebase/client';
import {
  EDGE_TTS_VOICE_PRESETS,
  validateEdgeTtsSettings,
  type EdgeTtsVoiceId,
} from './providerConfig';

export const EDGE_TTS_VOICES = EDGE_TTS_VOICE_PRESETS;
export type { EdgeTtsVoiceId };

export interface EdgeTtsSegment {
  role: string;
  voice?: EdgeTtsVoiceId;
  text: string;
  pauseMs?: number;
}

export interface EdgeTtsPayload {
  jobId: string;
  voice: EdgeTtsVoiceId;
  rate: string;
  pitch: string;
  segments: EdgeTtsSegment[];
}

export interface EdgeTtsAudioResult {
  dataUrl: string;
  fileName: string;
  mimeType: 'audio/mpeg';
  segmentCount: number;
  characterCount?: number;
}

export function validateEdgeTtsPayload(
  payload: EdgeTtsPayload
): { ok: true } | { ok: false; error: string } {
  if (!payload || typeof payload.jobId !== 'string' || !payload.jobId.trim() || payload.jobId.length > 128) {
    return { ok: false, error: 'jobId audio narasi tidak valid.' };
  }

  const settings = validateEdgeTtsSettings({
    workerUrl: 'http://127.0.0.1:8765',
    voice: payload.voice,
    rate: payload.rate,
    pitch: payload.pitch,
  });
  if (!settings.ok) return settings;

  if (!Array.isArray(payload.segments) || payload.segments.length < 1 || payload.segments.length > 100) {
    return { ok: false, error: 'Audio harus memiliki 1–100 segmen.' };
  }

  let totalLength = 0;
  for (const segment of payload.segments) {
    if (!segment || typeof segment.text !== 'string' || !segment.text.trim()) {
      return { ok: false, error: 'Setiap segmen audio harus memiliki teks.' };
    }
    if (segment.text.length > 10000) return { ok: false, error: 'Teks per segmen maksimal 10.000 karakter.' };
    totalLength += segment.text.length;
    if (typeof segment.role !== 'string' || !segment.role.trim() || segment.role.length > 50) {
      return { ok: false, error: 'Role segmen audio tidak valid.' };
    }
    if (segment.voice && !EDGE_TTS_VOICE_PRESETS.some((v) => v.id === segment.voice)) {
      return { ok: false, error: `Voice segmen tidak dikenal: ${segment.voice}` };
    }
    const pause = segment.pauseMs ?? 0;
    if (!Number.isInteger(pause) || pause < 0 || pause > 10000) {
      return { ok: false, error: 'Jeda antarsegmen harus 0–10.000 milidetik.' };
    }
  }
  if (totalLength > 80000) return { ok: false, error: 'Total teks narasi maksimal 80.000 karakter.' };
  return { ok: true };
}

export function buildEdgeTtsPayload(
  jobId: string,
  voice: EdgeTtsVoiceId,
  rate: string,
  pitch: string,
  segments: EdgeTtsSegment[]
): EdgeTtsPayload {
  const payload = { jobId, voice, rate, pitch, segments };
  const validation = validateEdgeTtsPayload(payload);
  if (!validation.ok) throw new Error(validation.error);
  return payload;
}

export async function generateEdgeTtsAudio(
  workerUrl: string,
  payload: EdgeTtsPayload,
  fetcher: typeof fetch = fetch
): Promise<EdgeTtsAudioResult> {
  const settings = validateEdgeTtsSettings({
    workerUrl,
    voice: payload.voice,
    rate: payload.rate,
    pitch: payload.pitch,
  });
  if (!settings.ok) throw new Error(settings.error);

  const validation = validateEdgeTtsPayload(payload);
  if (!validation.ok) throw new Error(validation.error);

  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi Firebase tidak tersedia. Silakan login kembali.');
  const firebaseIdToken = await user.getIdToken();

  const response = await fetcher(`${settings.value.workerUrl}/api/audio/generate`, {
    method: 'POST',
    mode: 'cors',
    headers: {
      Authorization: `Bearer ${firebaseIdToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({})) as {
    audioBase64?: string;
    dataUrl?: string;
    mimeType?: string;
    fileName?: string;
    segmentCount?: number;
    characterCount?: number;
    error?: string;
    detail?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? body.detail ?? `Windows Worker menolak permintaan (HTTP ${response.status}).`);
  }

  const mimeType = body.mimeType ?? 'audio/mpeg';
  const dataUrl = body.dataUrl ??
    (body.audioBase64 ? `data:${mimeType};base64,${body.audioBase64}` : '');
  if (!dataUrl.startsWith('data:audio/')) {
    throw new Error('Worker tidak mengembalikan audio MP3 yang valid.');
  }

  return {
    dataUrl,
    fileName: body.fileName ?? `${payload.jobId}-narasi.mp3`,
    mimeType: 'audio/mpeg',
    segmentCount: body.segmentCount ?? payload.segments.length,
    characterCount: body.characterCount,
  };
}
