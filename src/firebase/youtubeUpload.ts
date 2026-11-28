import type { ShortsChannelId } from '../office/shortsFactory';
import type { PipelineYoutubeMetadata } from '../office/productionPipeline';

export interface YoutubeUploadOptions {
  channelId: ShortsChannelId;
  videoDataUrl: string;
  metadata: PipelineYoutubeMetadata;
  privacyStatus: 'private' | 'unlisted' | 'public';
  runId: string;
  onProgress?: (percent: number) => void;
}

export interface YoutubeUploadResult {
  videoId: string;
  videoUrl: string;
  title: string;
  historyWarning?: string;
}

export async function uploadVideoToYoutube(options: YoutubeUploadOptions): Promise<YoutubeUploadResult> {
  const videoBlob = await (await fetch(options.videoDataUrl)).blob();
  if (!videoBlob.size || !videoBlob.type.startsWith('video/')) {
    throw new Error('File video final tidak valid atau kosong.');
  }
  if (videoBlob.size > 256 * 1024 * 1024 * 1024) {
    throw new Error('Ukuran video melebihi batas YouTube 256 GB.');
  }
  const tokenResponse = await fetch('/api/youtube/access-token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId: options.channelId }),
  });
  const tokenData = await tokenResponse.json() as { accessToken?: string; error?: string };
  if (!tokenResponse.ok || !tokenData.accessToken) throw new Error(tokenData.error || 'Token upload YouTube tidak tersedia.');

  const title = options.metadata.seoTitle.trim().slice(0, 100);
  const hashtags = options.metadata.hashtags.map((tag) => tag.startsWith('#') ? tag : `#${tag}`);
  const description = [options.metadata.description.trim(), '', hashtags.join(' ')].filter(Boolean).join('\n').slice(0, 5000);
  if (!title) throw new Error('Agen SEO belum menghasilkan judul video.');
  const metadata = {
    snippet: {
      title,
      description,
      tags: hashtags.map((tag) => tag.replace(/^#/, '').replace(/[^\p{L}\p{N}_-]/gu, '')).filter(Boolean).slice(0, 30),
      categoryId: '27',
    },
    status: {
      privacyStatus: options.privacyStatus,
      selfDeclaredMadeForKids: options.metadata.madeForKids,
    },
  };
  const sessionResponse = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenData.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(videoBlob.size),
      'X-Upload-Content-Type': videoBlob.type || 'video/mp4',
    },
    body: JSON.stringify(metadata),
  });
  if (!sessionResponse.ok) {
    const error = await sessionResponse.text();
    throw new Error(`YouTube menolak pembuatan sesi upload (HTTP ${sessionResponse.status}): ${error.slice(0, 500)}`);
  }
  const uploadUrl = sessionResponse.headers.get('Location');
  if (!uploadUrl) throw new Error('YouTube tidak mengembalikan alamat sesi upload resumable.');
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tokenData.accessToken}`,
      'Content-Type': videoBlob.type || 'video/mp4',
    },
    body: videoBlob,
  });
  const result = await uploadResponse.json() as { id?: string; error?: { message?: string } };
  if (!uploadResponse.ok || !result.id) {
    throw new Error(result.error?.message || `Upload video YouTube gagal (HTTP ${uploadResponse.status}).`);
  }
  const videoUrl = `https://www.youtube.com/watch?v=${result.id}`;
  const historyResponse = await fetch('/api/youtube/uploads/record', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelId: options.channelId, videoId: result.id, title,
      description, privacyStatus: options.privacyStatus, status: 'uploaded', runId: options.runId,
    }),
  });
  let historyWarning: string | undefined;
  if (!historyResponse.ok) {
    const historyError = await historyResponse.json().catch(() => ({})) as { error?: string };
    historyWarning = 'Video sudah terunggah, tetapi riwayat Firestore gagal disimpan: ' + (historyError.error || historyResponse.statusText);
  }
  options.onProgress?.(100);
  return { videoId: result.id, videoUrl, title, historyWarning };
}
