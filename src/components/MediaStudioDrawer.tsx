import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Film,
  ImagePlus,
  Wand2,
  X,
  Upload,
  MonitorPlay,
  Frame,
  Download,
  RotateCcw,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { BUILDING_FLOORS, type FloorId } from '../office/buildingFloors';
import type { ProviderConfig } from '../office/providerConfig';
import { buildEdgeTtsPayload, generateEdgeTtsAudio } from '../office/edgeTtsClient';
import type { LightingPreset } from '../office/types';
import {
  ALLOWED_IMAGE_ASPECTS,
  ALLOWED_IMAGE_SIZES,
  ALLOWED_VIDEO_ASPECTS,
  ALLOWED_VIDEO_DURATIONS,
  validateImageRequest,
  validateVideoRequest,
  type GeneratedMediaItem,
  type ImageAspectRatio,
  type ImageResolution,
  type ImageStudioMode,
  type VideoAspectRatio,
  type VideoDuration,
} from '../office/mediaStudio';

export interface MediaStudioPrefill {
  tab: 'video' | 'image';
  prompt: string;
  videoAspect?: VideoAspectRatio;
  imageAspect?: ImageAspectRatio;
  nonce: number;
}

interface MediaStudioDrawerProps {
  activeFloorId: FloorId;
  lighting: LightingPreset;
  items: GeneratedMediaItem[];
  projectedVideoId: string | null;
  mountedImageUrl: string | null;
  prefill?: MediaStudioPrefill | null;
  onClose: () => void;
  onMediaCreated: (item: GeneratedMediaItem) => void;
  onProjectVideo: (item: GeneratedMediaItem | null) => void;
  onMountGalleryImage: (dataUrl: string | null, label?: string) => void;
  providerConfig: ProviderConfig;
  editorNarrationAudioUrl: string | null;
  onVoiceSynthesisEvent: (phase: 'start' | 'done' | 'error', label: string) => void;
  onNarrationAudioCreated: (dataUrl: string) => void;
}

type StudioTab = 'video' | 'image';

const VIDEO_PRESETS: Array<{ label: string; aspect: VideoAspectRatio; prompt: string }> = [
  {
    label: 'Tur Studio 16:9',
    aspect: '16:9',
    prompt:
      'Smooth architectural dolly shot gliding through a sunlit Scandinavian AI design studio with warm oak floors, glass meeting rooms, and glowing holographic telemetry displays.',
  },
  {
    label: 'Showcase Produk 9:16',
    aspect: '9:16',
    prompt:
      'Vertical cinematic product reveal of a sleek matte-black and brushed-brass AI desktop companion rotating slowly under warm studio rim lighting.',
  },
];

const IMAGE_PRESETS: Array<{ label: string; mode: ImageStudioMode; prompt: string }> = [
  {
    label: 'Poster Arsitektur AI',
    mode: 'create',
    prompt:
      'Minimalist architectural exhibition poster of a futuristic sunlit glass AI studio, Swiss editorial typography layout, warm oak and cobalt accents, ultra crisp.',
  },
  {
    label: 'Konsep Produk 3D',
    mode: 'create',
    prompt:
      'Industrial design render of a brushed aluminum and walnut smart workstation hub on a clean studio plinth, soft diffused daylight, architectural catalog style.',
  },
];

export function MediaStudioDrawer({
  activeFloorId,
  lighting,
  items,
  projectedVideoId,
  mountedImageUrl,
  prefill,
  onClose,
  onMediaCreated,
  onProjectVideo,
  onMountGalleryImage,
  providerConfig,
  editorNarrationAudioUrl,
  onVoiceSynthesisEvent,
  onNarrationAudioCreated,
}: MediaStudioDrawerProps) {
  const floorCfg = BUILDING_FLOORS[activeFloorId];
  const isDark = lighting === 'malam';
  const [activeTab, setActiveTab] = useState<StudioTab>('video');

  // Video state
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoAspect, setVideoAspect] = useState<VideoAspectRatio>('16:9');
  const [videoDuration, setVideoDuration] = useState<VideoDuration>('10s');
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [narrationText, setNarrationText] = useState('Pada suatu hari, Tuhan menuntun umat-Nya melewati perjalanan yang penuh harapan.');
  const [narrationAudioUrl, setNarrationAudioUrl] = useState<string | null>(null);
  const [narrationBusy, setNarrationBusy] = useState(false);
  const [narrationError, setNarrationError] = useState<string | null>(null);

  // Image state
  const [imageMode, setImageMode] = useState<ImageStudioMode>('create');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageAspect, setImageAspect] = useState<ImageAspectRatio>('16:9');
  const [imageSize, setImageSize] = useState<ImageResolution>('1K');
  const [sourceImageDataUrl, setSourceImageDataUrl] = useState<string | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    if (!prefill) return;
    setActiveTab(prefill.tab);
    if (prefill.tab === 'video') {
      setVideoPrompt(prefill.prompt);
      if (prefill.videoAspect) setVideoAspect(prefill.videoAspect);
      setVideoError(null);
    } else {
      setImageMode('create');
      setImagePrompt(prefill.prompt);
      if (prefill.imageAspect) setImageAspect(prefill.imageAspect);
      setImageError(null);
    }
  }, [prefill]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoPromptId = useId();
  const imagePromptId = useId();
  const fileUploadId = useId();

  const videos = items.filter((it) => it.kind === 'video');
  const images = items.filter((it) => it.kind === 'image');

  const surfaceClass = isDark
    ? 'border-slate-700/90 bg-[#0f172a]/96 text-slate-100'
    : 'border-slate-200/95 bg-[#fcfbf8]/97 text-slate-900';

  const subtleBorder = isDark ? 'border-slate-800' : 'border-slate-200/90';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';
  const inputSurface = isDark
    ? 'border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500'
    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400';
  const segBg = isDark ? 'bg-slate-800/90' : 'bg-slate-200/80';
  const segActive = isDark
    ? 'bg-slate-100 text-slate-950 font-semibold'
    : 'bg-white text-slate-950 font-semibold shadow-xs';
  const segIdle = isDark
    ? 'text-slate-300 hover:text-white'
    : 'text-slate-600 hover:text-slate-950';
  const cardBg = isDark
    ? 'border-slate-800 bg-slate-900/85'
    : 'border-slate-200 bg-white';

  const handleGenerateVideo = async (e: FormEvent) => {
    e.preventDefault();
    setVideoError(null);

    const check = validateVideoRequest({
      prompt: videoPrompt,
      aspectRatio: videoAspect,
      duration: videoDuration,
    });
    if (!check.ok || !check.value) {
      setVideoError(check.error ?? 'Prompt video tidak valid.');
      return;
    }

    setVideoLoading(true);
    try {
      const response = await fetch('/api/studio/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...check.value,
          floorId: activeFloorId,
          channelId: floorCfg.channelId,
        }),
      });
      const data = (await response.json()) as {
        dataUrl?: string;
        mimeType?: string;
        aspectRatio?: VideoAspectRatio;
        prompt?: string;
        createdAt?: string;
        error?: string;
      };

      if (!response.ok || !data.dataUrl) {
        setVideoError(data.error ?? 'Gagal membuat video AI.');
        return;
      }

      const item: GeneratedMediaItem = {
        id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        kind: 'video',
        prompt: data.prompt ?? check.value.prompt,
        dataUrl: data.dataUrl,
        mimeType: data.mimeType ?? 'video/mp4',
        aspectRatio: data.aspectRatio ?? check.value.aspectRatio,
        createdAt: data.createdAt ?? new Date().toISOString(),
      };
      onMediaCreated(item);
      onProjectVideo(item);
    } catch {
      setVideoError('Koneksi ke layanan pembuatan video terputus.');
    } finally {
      setVideoLoading(false);
    }
  };

  const handleGenerateNarration = async () => {
    const text = narrationText.trim();
    if (text.length < 3 || text.length > 80000) {
      setNarrationError('Naskah narasi harus berisi 3 sampai 80.000 karakter.');
      return;
    }
    if (providerConfig.voiceProvider !== 'edge-tts') {
      setNarrationError('Pilih Edge-TTS pada Pengaturan → Suara & TTS untuk menggunakan tombol ini.');
      return;
    }

    setNarrationBusy(true);
    setNarrationError(null);
    setNarrationAudioUrl(null);
    onVoiceSynthesisEvent('start', 'Membuat audio narasi Edge-TTS dari Video Editor');
    try {
      const settings = providerConfig.edgeTts;
      const payload = buildEdgeTtsPayload(
        `editor-${Date.now()}`,
        settings.voice,
        settings.rate,
        settings.pitch,
        [{ role: 'narator', voice: settings.voice, text, pauseMs: 0 }]
      );
      const result = await generateEdgeTtsAudio(settings.workerUrl, payload);
      setNarrationAudioUrl(result.dataUrl);
      onVoiceSynthesisEvent('done', 'Audio Edge-TTS selesai dari Video Editor');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal membuat audio narasi Edge-TTS.';
      setNarrationError(message);
      onVoiceSynthesisEvent('error', message);
    } finally {
      setNarrationBusy(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      setImageError('Gunakan berkas gambar berformat PNG, JPG, atau WebP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImageError('Ukuran gambar sumber maksimal 10 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceImageDataUrl(reader.result);
        setSourceFileName(file.name);
        setImageMode('edit');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateImage = async (e: FormEvent) => {
    e.preventDefault();
    setImageError(null);

    const check = validateImageRequest({
      mode: imageMode,
      prompt: imagePrompt,
      aspectRatio: imageAspect,
      imageSize,
      sourceImageDataUrl,
    });
    if (!check.ok || !check.value) {
      setImageError(check.error ?? 'Input gambar tidak valid.');
      return;
    }

    setImageLoading(true);
    try {
      const response = await fetch('/api/studio/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: check.value.mode,
          prompt: check.value.prompt,
          aspectRatio: check.value.aspectRatio,
          imageSize: check.value.imageSize,
          sourceImageDataUrl: check.value.mode === 'edit' ? sourceImageDataUrl : undefined,
          floorId: activeFloorId,
          channelId: floorCfg.channelId,
        }),
      });
      const data = (await response.json()) as {
        dataUrl?: string;
        mimeType?: string;
        caption?: string;
        aspectRatio?: string;
        mode?: ImageStudioMode;
        prompt?: string;
        createdAt?: string;
        error?: string;
      };

      if (!response.ok || !data.dataUrl) {
        setImageError(data.error ?? 'Gagal memproses gambar AI.');
        return;
      }

      const item: GeneratedMediaItem = {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        kind: 'image',
        prompt: data.prompt ?? check.value.prompt,
        dataUrl: data.dataUrl,
        mimeType: data.mimeType ?? 'image/png',
        aspectRatio: data.aspectRatio ?? check.value.aspectRatio,
        mode: data.mode ?? check.value.mode,
        caption: data.caption,
        createdAt: data.createdAt ?? new Date().toISOString(),
      };
      onMediaCreated(item);
      onMountGalleryImage(item.dataUrl, item.mode === 'edit' ? 'Hasil Edit AI' : 'Karya Gambar AI');
    } catch {
      setImageError('Koneksi ke layanan gambar AI terputus.');
    } finally {
      setImageLoading(false);
    }
  };

  const handleStartEditFromItem = (item: GeneratedMediaItem) => {
    setActiveTab('image');
    setImageMode('edit');
    setSourceImageDataUrl(item.dataUrl);
    setSourceFileName('Karya Galeri AI');
    setImageError(null);
  };

  return (
    <section
      aria-label="Studio Media AI Kantor 3D"
      className={`pointer-events-auto mb-2 w-full rounded-xl border shadow-xl transition-colors duration-200 ${surfaceClass}`}
    >
      {/* Header Row with Tabs & Close */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2.5 ${subtleBorder}`}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <div>
            <h2 className="text-sm font-bold tracking-tight">
              Studio Media AI · {floorCfg.shortLabel}
            </h2>
            <p className={`text-[11px] ${mutedText}`}>
              Proyeksikan ke Layar Lantai {activeFloorId} · Kunci API:{' '}
              <span className="font-mono">{floorCfg.geminiEnvVar}</span>
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Alat Studio Media AI"
            className={`flex items-center gap-1 rounded-lg p-0.5 ${segBg}`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'video'}
              onClick={() => setActiveTab('video')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs whitespace-nowrap transition-colors ${
                activeTab === 'video' ? segActive : segIdle
              }`}
            >
              <Film className="h-3.5 w-3.5" aria-hidden="true" />
              Video AI
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'image'}
              onClick={() => setActiveTab('image')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs whitespace-nowrap transition-colors ${
                activeTab === 'image' ? segActive : segIdle
              }`}
            >
              <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
              Gambar &amp; Edit AI
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {(projectedVideoId || mountedImageUrl) && (
            <button
              type="button"
              onClick={() => {
                if (projectedVideoId) onProjectVideo(null);
                if (mountedImageUrl) onMountGalleryImage(null);
              }}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${
                isDark
                  ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Reset Layar 3D
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Studio Media AI"
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

      {/* Body Grid: Left Controls, Right Preview / 3D Projection Shelf */}
      <div className="grid max-h-[340px] grid-cols-1 gap-3 overflow-y-auto p-3.5 md:grid-cols-12">
        {activeTab === 'video' ? (
          <>
            <form onSubmit={handleGenerateVideo} className="space-y-2.5 md:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={videoPromptId} className="text-xs font-semibold">
                  Deskripsi Video (Text-to-Video)
                </label>
                <div className="flex items-center gap-1.5">
                  {VIDEO_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setVideoPrompt(preset.prompt);
                        setVideoAspect(preset.aspect);
                        setVideoError(null);
                      }}
                      className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                        isDark
                          ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                id={videoPromptId}
                rows={2}
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                placeholder="Contoh: Tur kamera halus mengelilingi studio arsitektur AI bercahaya matahari pagi..."
                className={`w-full resize-none rounded-lg border px-3 py-2 text-xs leading-relaxed focus:border-blue-500 focus:outline-none ${inputSurface}`}
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Strict 16:9 / 9:16 Aspect Ratio */}
                  <div
                    role="group"
                    aria-label="Rasio aspek video"
                    className={`flex items-center gap-0.5 rounded-lg p-0.5 ${segBg}`}
                  >
                    {ALLOWED_VIDEO_ASPECTS.map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setVideoAspect(ratio)}
                        aria-pressed={videoAspect === ratio}
                        className={`rounded-md px-2 py-1 font-mono text-[11px] tabular-nums transition-colors ${
                          videoAspect === ratio ? segActive : segIdle
                        }`}
                      >
                        {ratio === '16:9' ? '16:9 Lanskap' : '9:16 Potret'}
                      </button>
                    ))}
                  </div>

                  {/* Duration */}
                  <div
                    role="group"
                    aria-label="Durasi video"
                    className={`flex items-center gap-0.5 rounded-lg p-0.5 ${segBg}`}
                  >
                    {ALLOWED_VIDEO_DURATIONS.map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => setVideoDuration(dur)}
                        aria-pressed={videoDuration === dur}
                        className={`rounded-md px-2 py-1 font-mono text-[11px] tabular-nums transition-colors ${
                          videoDuration === dur ? segActive : segIdle
                        }`}
                      >
                        {dur}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={videoLoading}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                    isDark
                      ? 'bg-blue-600 text-white hover:bg-blue-500'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {videoLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Merender Video...
                    </>
                  ) : (
                    <>
                      <Film className="h-3.5 w-3.5" aria-hidden="true" />
                      Buat Video
                    </>
                  )}
                </button>
              </div>

              {videoError && (
                <div
                  role="alert"
                  className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                    isDark
                      ? 'border-rose-500/40 bg-rose-950/60 text-rose-200'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{videoError}</span>
                </div>
              )}
            </form>

            <section className={`space-y-2 rounded-lg border p-3 md:col-span-7 ${cardBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold">Audio Narasi untuk Video</h3>
                <span className={`text-[10px] ${mutedText}`}>
                  {providerConfig.voiceProvider === 'edge-tts' ? 'Edge-TTS aktif' : 'Pilih Edge-TTS di Pengaturan'}
                </span>
              </div>
              <textarea
                rows={3}
                value={narrationText}
                onChange={(e) => setNarrationText(e.target.value)}
                placeholder="Tempelkan teks narasi untuk video..."
                className={`w-full resize-y rounded-lg border px-2.5 py-2 text-xs leading-relaxed ${inputSurface}`}
              />
              {narrationError && <p role="alert" className="text-[11px] text-rose-500">{narrationError}</p>}
              {(narrationAudioUrl || editorNarrationAudioUrl) && (
                <div className="flex flex-wrap items-center gap-2">
                  <audio controls src={narrationAudioUrl ?? editorNarrationAudioUrl ?? undefined} className="h-8 min-w-0 flex-1" />
                  <a href={narrationAudioUrl ?? editorNarrationAudioUrl ?? undefined} download="kantor-ai-narasi-edge-tts.mp3" className={`rounded-md border px-2 py-1 text-[11px] ${subtleBorder}`}>
                    <Download className="mr-1 inline h-3 w-3" /> Unduh MP3
                  </a>
                  <button type="button" onClick={() => onNarrationAudioCreated(narrationAudioUrl ?? editorNarrationAudioUrl!)} className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white">Pasang ke proyek video</button>
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleGenerateNarration()}
                disabled={narrationBusy || providerConfig.voiceProvider !== 'edge-tts'}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 ${isDark ? 'bg-sky-600' : 'bg-slate-900'}`}
              >
                {narrationBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
                {narrationBusy ? 'Membuat audio...' : 'Buat Audio Narasi (Edge-TTS)'}
              </button>
            </section>

            {/* Video Output Shelf */}
            <div className="space-y-2 md:col-span-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">
                  Arsip Video ({videos.length})
                </span>
                <span className={`font-mono text-[10px] ${mutedText}`}>
                  gemini-omni-1.2-flash
                </span>
              </div>

              {videos.length === 0 ? (
                <div
                  className={`flex h-[132px] flex-col items-center justify-center rounded-lg border border-dashed px-3 text-center ${subtleBorder}`}
                >
                  <MonitorPlay className={`h-5 w-5 ${mutedText}`} aria-hidden="true" />
                  <p className={`mt-1.5 text-xs ${mutedText}`}>
                    Video yang dihasilkan dapat langsung diputar di Layar Presentasi Ruang Rapat 3D.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {videos.map((vid) => {
                    const isProjected = projectedVideoId === vid.id;
                    return (
                      <div key={vid.id} className={`rounded-lg border p-2 ${cardBg}`}>
                        <video
                          src={vid.dataUrl}
                          controls
                          loop
                          playsInline
                          className="max-h-[120px] w-full rounded bg-black object-contain"
                        />
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                          <span className={`font-mono text-[10px] ${mutedText}`}>
                            {vid.aspectRatio}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onProjectVideo(isProjected ? null : vid)}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                                isProjected
                                  ? 'bg-emerald-600 text-white'
                                  : isDark
                                  ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                              }`}
                            >
                              <MonitorPlay className="h-3 w-3" aria-hidden="true" />
                              {isProjected ? 'Aktif di Layar 3D' : 'Proyeksikan ke 3D'}
                            </button>
                            <a
                              href={vid.dataUrl}
                              download={`kantor-ai-video-${vid.aspectRatio.replace(':', 'x')}.mp4`}
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${subtleBorder}`}
                            >
                              <Download className="h-3 w-3" aria-hidden="true" />
                              Unduh
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <form onSubmit={handleGenerateImage} className="space-y-2.5 md:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  role="group"
                  aria-label="Mode gambar AI"
                  className={`flex items-center gap-0.5 rounded-lg p-0.5 ${segBg}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setImageMode('create');
                      setImageError(null);
                    }}
                    aria-pressed={imageMode === 'create'}
                    className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                      imageMode === 'create' ? segActive : segIdle
                    }`}
                  >
                    Buat Gambar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImageMode('edit');
                      setImageError(null);
                    }}
                    aria-pressed={imageMode === 'edit'}
                    className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                      imageMode === 'edit' ? segActive : segIdle
                    }`}
                  >
                    Edit Gambar
                  </button>
                </div>

                {imageMode === 'create' && (
                  <div className="flex items-center gap-1.5">
                    {IMAGE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setImagePrompt(preset.prompt);
                          setImageError(null);
                        }}
                        className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                          isDark
                            ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {imageMode === 'edit' && (
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-2 ${subtleBorder}`}
                >
                  <div className="flex items-center gap-2.5">
                    {sourceImageDataUrl ? (
                      <img
                        src={sourceImageDataUrl}
                        alt="Pratinjau gambar sumber"
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded border border-dashed ${subtleBorder}`}
                      >
                        <Upload className={`h-4 w-4 ${mutedText}`} aria-hidden="true" />
                      </div>
                    )}
                    <div className="text-xs">
                      <p className="font-medium">
                        {sourceFileName ?? 'Belum ada gambar sumber'}
                      </p>
                      <p className={`text-[11px] ${mutedText}`}>
                        Unggah PNG/JPG/WebP atau pilih karya galeri untuk diedit
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      ref={fileInputRef}
                      id={fileUploadId}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                    <label
                      htmlFor={fileUploadId}
                      className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        isDark
                          ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                          : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <Upload className="h-3 w-3" aria-hidden="true" />
                      Unggah Gambar
                    </label>
                    {sourceImageDataUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          onMountGalleryImage(sourceImageDataUrl, sourceFileName ?? 'Gambar Lokal')
                        }
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                          isDark
                            ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Frame className="h-3 w-3" aria-hidden="true" />
                        Pasang di 3D
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor={imagePromptId} className="sr-only">
                  {imageMode === 'edit' ? 'Instruksi pengeditan gambar' : 'Deskripsi gambar baru'}
                </label>
                <textarea
                  id={imagePromptId}
                  rows={2}
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder={
                    imageMode === 'edit'
                      ? 'Contoh: Ubah suasana pencahayaan menjadi senja hangat dan tambahkan aksen tanaman hijau...'
                      : 'Contoh: Karya seni editorial modern untuk dinding galeri Kantor AI dengan nuansa kayu oak...'
                  }
                  className={`w-full resize-none rounded-lg border px-3 py-2 text-xs leading-relaxed focus:border-blue-500 focus:outline-none ${inputSurface}`}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div
                    role="group"
                    aria-label="Rasio aspek gambar"
                    className={`flex items-center gap-0.5 rounded-lg p-0.5 ${segBg}`}
                  >
                    {ALLOWED_IMAGE_ASPECTS.map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setImageAspect(ratio)}
                        aria-pressed={imageAspect === ratio}
                        className={`rounded-md px-2 py-1 font-mono text-[11px] tabular-nums transition-colors ${
                          imageAspect === ratio ? segActive : segIdle
                        }`}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>

                  <div
                    role="group"
                    aria-label="Resolusi gambar"
                    className={`flex items-center gap-0.5 rounded-lg p-0.5 ${segBg}`}
                  >
                    {ALLOWED_IMAGE_SIZES.map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setImageSize(sz)}
                        aria-pressed={imageSize === sz}
                        className={`rounded-md px-2 py-1 font-mono text-[11px] tabular-nums transition-colors ${
                          imageSize === sz ? segActive : segIdle
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={imageLoading}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                    isDark
                      ? 'bg-blue-600 text-white hover:bg-blue-500'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {imageLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {imageMode === 'edit' ? 'Edit Gambar' : 'Buat Gambar'}
                    </>
                  )}
                </button>
              </div>

              {imageError && (
                <div
                  role="alert"
                  className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                    isDark
                      ? 'border-rose-500/40 bg-rose-950/60 text-rose-200'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{imageError}</span>
                </div>
              )}
            </form>

            {/* Image Gallery Output Shelf */}
            <div className="space-y-2 md:col-span-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">
                  Galeri Gambar ({images.length})
                </span>
                <span className={`font-mono text-[10px] ${mutedText}`}>
                  gemini-nano-banana-2.1
                </span>
              </div>

              {images.length === 0 ? (
                <div
                  className={`flex h-[132px] flex-col items-center justify-center rounded-lg border border-dashed px-3 text-center ${subtleBorder}`}
                >
                  <Frame className={`h-5 w-5 ${mutedText}`} aria-hidden="true" />
                  <p className={`mt-1.5 text-xs ${mutedText}`}>
                    Gambar hasil kreasi atau edit dapat langsung dipasang pada Bingkai Galeri 3D di dinding studio.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {images.map((img) => {
                    const isMounted = mountedImageUrl === img.dataUrl;
                    return (
                      <div key={img.id} className={`rounded-lg border p-2 ${cardBg}`}>
                        <img
                          src={img.dataUrl}
                          alt={img.prompt}
                          className="max-h-[120px] w-full rounded bg-slate-950/10 object-contain"
                        />
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                          <span className={`font-mono text-[10px] ${mutedText}`}>
                            {img.aspectRatio}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                onMountGalleryImage(isMounted ? null : img.dataUrl, 'Karya AI')
                              }
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                                isMounted
                                  ? 'bg-emerald-600 text-white'
                                  : isDark
                                  ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                              }`}
                            >
                              <Frame className="h-3 w-3" aria-hidden="true" />
                              {isMounted ? 'Terpasang di 3D' : 'Pasang di 3D'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEditFromItem(img)}
                              className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${subtleBorder}`}
                            >
                              Edit
                            </button>
                            <a
                              href={img.dataUrl}
                              download={`kantor-ai-karya-${img.id}.png`}
                              aria-label="Unduh gambar"
                              className={`inline-flex items-center rounded-md border p-1 transition-colors ${subtleBorder}`}
                            >
                              <Download className="h-3 w-3" aria-hidden="true" />
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
