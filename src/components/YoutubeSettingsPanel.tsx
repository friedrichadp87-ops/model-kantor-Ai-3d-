import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Link2, ShieldCheck, Unplug, Youtube } from 'lucide-react';
import type { LightingPreset } from '../office/types';
import type { ShortsChannelId } from '../office/shortsFactory';

type PrivacyStatus = 'private' | 'unlisted' | 'public';
interface ChannelConnection {
  channelId: ShortsChannelId;
  connected: boolean;
  autoUploadEnabled: boolean;
  privacyStatus: PrivacyStatus;
  targetChannelLabel: string;
  googleEmail: string;
  connectedAt?: string;
  lastUploadAt?: string;
}
interface YoutubeSettingsPanelProps {
  lighting: LightingPreset;
  signedIn: boolean;
}
const CHANNELS: Array<{ id: ShortsChannelId; name: string; hint: string }> = [
  { id: 'daily-faith-inspiration', name: 'Daily Faith & Inspiration', hint: 'Lantai 1' },
  { id: 'bible-stories-3d', name: 'Bible Stories 3D', hint: 'Lantai 2' },
  { id: 'bible-facts-mysteries', name: 'Bible Facts & Mysteries', hint: 'Lantai 3' },
];

export function YoutubeSettingsPanel({ lighting, signedIn }: YoutubeSettingsPanelProps) {
  const isDark = lighting === 'malam';
  const [configured, setConfigured] = useState(false);
  const [channels, setChannels] = useState<ChannelConnection[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panel = isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white';
  const muted = isDark ? 'text-slate-400' : 'text-slate-600';

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    try {
      const response = await fetch('/api/youtube/status', { cache: 'no-store' });
      const data = await response.json() as { configured?: boolean; channels?: ChannelConnection[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Gagal memeriksa koneksi YouTube.');
      setConfigured(data.configured === true);
      setChannels(data.channels ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tidak dapat memeriksa koneksi YouTube.');
    }
  }, [signedIn]);

  useEffect(() => { void refresh(); }, [refresh]);

  const connect = async (channelId: ShortsChannelId) => {
    setBusy(channelId); setError(null); setNotice(null);
    try {
      const response = await fetch('/api/youtube/oauth/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      const data = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error || 'Tidak dapat memulai login YouTube.');
      window.location.assign(data.authorizationUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memulai koneksi YouTube.');
      setBusy(null);
    }
  };

  const update = async (channel: ChannelConnection, patch: Partial<ChannelConnection>) => {
    setBusy(channel.channelId); setError(null); setNotice(null);
    try {
      const response = await fetch('/api/youtube/connections/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channel.channelId, ...patch }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Gagal menyimpan pengaturan channel.');
      setNotice('Pengaturan channel tersimpan.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan channel.');
    } finally { setBusy(null); }
  };

  const disconnect = async (channelId: ShortsChannelId) => {
    if (!window.confirm('Putuskan koneksi YouTube untuk channel ini? Agen tidak dapat mengunggah lagi sampai akun dihubungkan ulang.')) return;
    setBusy(channelId); setError(null);
    try {
      const response = await fetch('/api/youtube/connections/disconnect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Gagal memutus koneksi YouTube.');
      setNotice('Koneksi YouTube telah diputus.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memutus koneksi.');
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border p-3 ${panel}`}>
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />
          <div>
            <h3 className="text-xs font-bold">Google OAuth · YouTube Data API v3</h3>
            <p className={`mt-1 text-[11px] leading-relaxed ${muted}`}>
              Refresh token disimpan terenkripsi AES-256-GCM di Firestore. Token rahasia tidak pernah dikirim ke browser.
              Izin yang diminta dibatasi pada upload video (youtube.upload) dan identitas email Google.
            </p>
          </div>
        </div>
        {!signedIn && <p className="mt-3 text-xs text-amber-500">Masuk ke Kantor AI terlebih dahulu untuk menghubungkan kanal.</p>}
        {signedIn && !configured && (
          <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
            Konfigurasi OAuth server belum lengkap. Admin perlu mengisi YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET,
            YOUTUBE_REDIRECT_URI, YOUTUBE_OAUTH_STATE_SECRET, dan YOUTUBE_TOKEN_ENCRYPTION_KEY di Netlify.
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`text-[11px] ${configured ? 'text-emerald-500' : 'text-amber-500'}`}>
            {configured ? 'Konfigurasi server terdeteksi' : 'Belum dikonfigurasi'}
          </span>
          <button type="button" onClick={() => void refresh()} className={`text-[11px] underline ${muted}`}>Periksa ulang</button>
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-sky-500 underline">
            Google Cloud Credentials <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {CHANNELS.map((item) => {
        const channel = channels.find((entry) => entry.channelId === item.id) ?? {
          channelId: item.id, connected: false, autoUploadEnabled: false, privacyStatus: 'private' as const,
          targetChannelLabel: '', googleEmail: '',
        };
        const loading = busy === item.id;
        return (
          <div key={item.id} className={`rounded-lg border p-3 ${panel}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold">{item.name}</p>
                <p className={`text-[10px] ${muted}`}>{item.hint}</p>
                <p className={`mt-1 text-[11px] ${channel.connected ? 'text-emerald-500' : muted}`}>
                  {channel.connected ? `Terhubung · ${channel.googleEmail || 'Google account'}` : 'Belum terhubung'}
                </p>
              </div>
              {channel.connected ? (
                <button type="button" disabled={loading} onClick={() => void disconnect(item.id)} className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 px-2.5 py-1.5 text-[11px] text-rose-500 disabled:opacity-50">
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />} Putuskan
                </button>
              ) : (
                <button type="button" disabled={!signedIn || !configured || loading} onClick={() => void connect(item.id)} className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Youtube className="h-3 w-3" />} Hubungkan YouTube
                </button>
              )}
            </div>
            {channel.connected && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className={`text-[11px] ${muted}`}>
                  Nama kanal (label)
                  <input value={channel.targetChannelLabel} maxLength={120} onChange={(event) => setChannels((prev) => prev.map((entry) => entry.channelId === item.id ? { ...entry, targetChannelLabel: event.target.value } : entry))} onBlur={(event) => void update(channel, { targetChannelLabel: event.target.value })} className={`mt-1 w-full rounded-md border px-2 py-1.5 text-xs ${panel}`} placeholder="Nama kanal YouTube" />
                </label>
                <label className={`text-[11px] ${muted}`}>
                  Privasi default upload
                  <select value={channel.privacyStatus} onChange={(event) => void update(channel, { privacyStatus: event.target.value as PrivacyStatus })} className={`mt-1 w-full rounded-md border px-2 py-1.5 text-xs ${panel}`}>
                    <option value="private">Private (disarankan)</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                </label>
                <label className={`flex items-center gap-2 text-[11px] sm:col-span-2 ${muted}`}>
                  <input type="checkbox" checked={channel.autoUploadEnabled} onChange={(event) => void update(channel, { autoUploadEnabled: event.target.checked })} />
                  Izinkan agen mengunggah otomatis setelah QC lulus
                </label>
                <p className={`text-[10px] ${muted} sm:col-span-2`}>
                  {channel.lastUploadAt ? `Upload terakhir: ${new Date(channel.lastUploadAt).toLocaleString('id-ID')}` : 'Belum ada riwayat upload.'}
                </p>
              </div>
            )}
          </div>
        );
      })}
      {error && <p role="alert" className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-500">{error}</p>}
      {notice && <p role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-500">{notice}</p>}
      <p className={`text-[10px] leading-relaxed ${muted}`}>
        Catatan: satu koneksi Google mengunggah ke kanal YouTube default dari akun tersebut. Jika tiga kanal berbeda, hubungkan akun Google yang sesuai pada setiap lantai. OAuth aplikasi yang masih berstatus Testing memiliki keterbatasan masa berlaku refresh token.
      </p>
    </div>
  );
}
