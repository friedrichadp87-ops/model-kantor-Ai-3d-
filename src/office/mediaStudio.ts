import type { ActivityLogEntry } from './activityLog';
import { formatLogTimestamp } from './activityLog';

export type VideoAspectRatio = '16:9' | '9:16';
export type VideoDuration = '5s' | '10s';
export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3';
export type ImageResolution = '1K' | '2K';
export type ImageStudioMode = 'create' | 'edit';

export interface VideoGenerationInput {
  prompt: string;
  aspectRatio: VideoAspectRatio;
  duration: VideoDuration;
}

export interface ImageGenerationInput {
  mode: ImageStudioMode;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  imageSize: ImageResolution;
  sourceImageDataUrl?: string | null;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

export interface ParsedDataUrl {
  mimeType: string;
  base64: string;
}

export interface GeneratedMediaItem {
  id: string;
  kind: 'video' | 'image';
  prompt: string;
  dataUrl: string;
  mimeType: string;
  aspectRatio: string;
  mode?: ImageStudioMode;
  caption?: string;
  createdAt: string;
}

export const ALLOWED_VIDEO_ASPECTS: readonly VideoAspectRatio[] = ['16:9', '9:16'];
export const ALLOWED_VIDEO_DURATIONS: readonly VideoDuration[] = ['5s', '10s'];
export const ALLOWED_IMAGE_ASPECTS: readonly ImageAspectRatio[] = ['1:1', '16:9', '9:16', '4:3'];
export const ALLOWED_IMAGE_SIZES: readonly ImageResolution[] = ['1K', '2K'];

export function validateVideoRequest(input: {
  prompt?: unknown;
  aspectRatio?: unknown;
  duration?: unknown;
}): ValidationResult<VideoGenerationInput> {
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (prompt.length < 4) {
    return {
      ok: false,
      error: 'Tuliskan deskripsi video minimal 4 karakter.',
    };
  }
  if (prompt.length > 800) {
    return {
      ok: false,
      error: 'Deskripsi video maksimal 800 karakter.',
    };
  }

  const aspectRatio =
    input.aspectRatio === '9:16'
      ? '9:16'
      : input.aspectRatio === '16:9' || input.aspectRatio === undefined
      ? '16:9'
      : null;
  if (!aspectRatio) {
    return {
      ok: false,
      error: 'Rasio aspek video harus 16:9 (lanskap) atau 9:16 (potret).',
    };
  }

  const duration: VideoDuration = input.duration === '5s' ? '5s' : '10s';

  return {
    ok: true,
    value: { prompt, aspectRatio, duration },
  };
}

export function parseImageDataUrl(dataUrl: string): ParsedDataUrl | null {
  const trimmed = dataUrl.trim();
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(trimmed);
  if (!match) return null;
  const rawMime = match[1].toLowerCase();
  const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  const base64 = match[2].replace(/\s+/g, '');
  if (base64.length < 16) return null;
  return { mimeType, base64 };
}

export function validateImageRequest(input: {
  mode?: unknown;
  prompt?: unknown;
  aspectRatio?: unknown;
  imageSize?: unknown;
  sourceImageDataUrl?: unknown;
}): ValidationResult<{
  mode: ImageStudioMode;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  imageSize: ImageResolution;
  sourceImage?: ParsedDataUrl;
}> {
  const mode: ImageStudioMode = input.mode === 'edit' ? 'edit' : 'create';
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';

  if (prompt.length < 3) {
    return {
      ok: false,
      error:
        mode === 'edit'
          ? 'Tuliskan instruksi pengeditan gambar minimal 3 karakter.'
          : 'Tuliskan deskripsi gambar minimal 3 karakter.',
    };
  }
  if (prompt.length > 800) {
    return {
      ok: false,
      error: 'Deskripsi gambar maksimal 800 karakter.',
    };
  }

  const aspectRatio: ImageAspectRatio = ALLOWED_IMAGE_ASPECTS.includes(
    input.aspectRatio as ImageAspectRatio
  )
    ? (input.aspectRatio as ImageAspectRatio)
    : '1:1';

  const imageSize: ImageResolution = input.imageSize === '2K' ? '2K' : '1K';

  if (mode === 'edit') {
    if (typeof input.sourceImageDataUrl !== 'string' || !input.sourceImageDataUrl.trim()) {
      return {
        ok: false,
        error: 'Pilih atau unggah gambar sumber terlebih dahulu untuk mode edit.',
      };
    }
    const parsed = parseImageDataUrl(input.sourceImageDataUrl);
    if (!parsed) {
      return {
        ok: false,
        error: 'Format gambar sumber tidak valid. Gunakan PNG, JPG, atau WebP.',
      };
    }
    return {
      ok: true,
      value: { mode, prompt, aspectRatio, imageSize, sourceImage: parsed },
    };
  }

  return {
    ok: true,
    value: { mode, prompt, aspectRatio, imageSize },
  };
}

/**
 * Computes normalized (scaleX, scaleY) plane scale so media of a given aspect ratio
 * fits cleanly inside a fixed 3D display frame (frameWidth x frameHeight) without distortion.
 */
export function computeScreenFitScale(
  frameWidth: number,
  frameHeight: number,
  mediaAspect: number
): { scaleX: number; scaleY: number } {
  if (frameWidth <= 0 || frameHeight <= 0 || !Number.isFinite(mediaAspect) || mediaAspect <= 0) {
    return { scaleX: 1, scaleY: 1 };
  }
  const frameAspect = frameWidth / frameHeight;
  if (mediaAspect >= frameAspect) {
    return { scaleX: 1, scaleY: frameAspect / mediaAspect };
  }
  return { scaleX: mediaAspect / frameAspect, scaleY: 1 };
}

export function aspectStringToRatio(aspect: string): number {
  const [wStr, hStr] = aspect.split(':');
  const w = Number(wStr);
  const h = Number(hStr);
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return w / h;
  }
  return 16 / 9;
}

export function createStudioActivityEntry(
  message: string,
  now: Date = new Date()
): ActivityLogEntry {
  return {
    id: `studio_${now.getTime()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: formatLogTimestamp(now),
    agentId: 'video-editor',
    agentName: 'Studio Media',
    accentHex: '#7c3aed',
    message,
    category: 'task',
  };
}
