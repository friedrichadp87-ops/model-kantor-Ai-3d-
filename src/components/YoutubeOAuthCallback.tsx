import { useEffect, useState } from 'react';
import { auth } from '../firebase/client';

export function YoutubeOAuthCallback() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');
    if (!code && !oauthError) return;

    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('scope');
    url.searchParams.delete('authuser');
    url.searchParams.delete('prompt');
    url.searchParams.delete('error');
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);

    let active = true;
    void (async () => {
      if (oauthError) {
        if (active) setMessage('Persetujuan Google dibatalkan atau ditolak. Koneksi YouTube belum berubah.');
        return;
      }
      if (!code || !state) {
        if (active) setMessage('Respons OAuth YouTube tidak lengkap. Silakan hubungkan kembali.');
        return;
      }
      try {
        await auth.authStateReady();
        if (!auth.currentUser) throw new Error('Sesi Kantor AI berakhir. Masuk kembali lalu hubungkan YouTube.');
        const response = await fetch('/api/youtube/oauth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
        });
        const data = await response.json() as { ok?: boolean; googleEmail?: string; error?: string };
        if (!response.ok || !data.ok) throw new Error(data.error || 'Gagal menyimpan koneksi YouTube.');
        if (active) setMessage(`Akun YouTube ${data.googleEmail || ''} berhasil dihubungkan. Buka Pengaturan → YouTube untuk melihat statusnya.`);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'Gagal menyelesaikan koneksi YouTube.');
      }
    })();
    return () => { active = false; };
  }, []);

  if (!message) return null;
  return (
    <div role="status" className="fixed bottom-4 right-4 z-[100] max-w-md rounded-xl border border-sky-500/40 bg-slate-950 p-4 text-xs text-white shadow-2xl">
      <div className="font-semibold">Koneksi YouTube</div>
      <p className="mt-1 leading-relaxed">{message}</p>
      <button type="button" onClick={() => setMessage(null)} className="mt-2 rounded-md bg-sky-600 px-3 py-1.5 font-semibold">Tutup</button>
    </div>
  );
}
