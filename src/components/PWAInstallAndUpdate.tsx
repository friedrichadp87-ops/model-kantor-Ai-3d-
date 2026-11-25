import { useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Laptop,
  RefreshCw,
  Smartphone,
  WifiOff,
  X,
} from 'lucide-react';
import { getInstallActionLabel } from '../pwa/pwaConfig';
import type { UsePWAResult } from '../pwa/usePWA';

interface PWASidebarActionProps {
  pwa: UsePWAResult;
  collapsed: boolean;
}

export function PWASidebarAction({ pwa, collapsed }: PWASidebarActionProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const hasUpdate = pwa.needRefresh || pwa.remoteUpdateAvailable;
  const installLabel = getInstallActionLabel(pwa.platform);

  const handlePrimaryClick = async () => {
    if (!pwa.isInstalled && pwa.isInstallable) {
      const accepted = await pwa.install();
      if (!accepted) {
        setModalOpen(true);
      }
      return;
    }
    setModalOpen(true);
  };

  return (
    <>
      <div className="border-t border-slate-800/80 px-2 py-2">
        <button
          type="button"
          data-testid="pwa-install-sidebar-btn"
          onClick={() => void handlePrimaryClick()}
          title={
            pwa.isInstalled
              ? 'Aplikasi terpasang · Cek pembaruan via officecontent.netlify.app'
              : `${installLabel} · Pembaruan otomatis via officecontent.netlify.app`
          }
          className={`flex w-full items-center rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${
            collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-2 text-left'
          } ${
            hasUpdate
              ? 'border-sky-400/70 bg-sky-950/60 text-sky-100 hover:bg-sky-900/70'
              : pwa.isInstalled
              ? 'border-slate-700/80 bg-[#0f1b2e] text-slate-200 hover:border-slate-500 hover:bg-[#16253d]'
              : 'border-sky-500/40 bg-[#10233d] text-sky-100 hover:border-sky-400 hover:bg-[#173052]'
          }`}
        >
          {hasUpdate ? (
            <RefreshCw className="h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
          ) : pwa.isInstalled ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
          )}

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-xs font-semibold">
                  {hasUpdate
                    ? 'Pembaruan Siap'
                    : pwa.isInstalled
                    ? 'Aplikasi Terpasang'
                    : installLabel}
                </span>
                {!pwa.isOnline && (
                  <span className="shrink-0 font-mono text-[9.5px] text-amber-300">Offline</span>
                )}
              </div>
              <p className="truncate text-[10px] text-slate-400">
                {hasUpdate
                  ? 'Klik untuk muat versi terbaru'
                  : pwa.isInstalled
                  ? 'Update via officecontent.netlify.app'
                  : 'PC & Android · Auto-update browser'}
              </p>
            </div>
          )}
        </button>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-modal-title"
          data-testid="pwa-install-modal"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700/90 bg-[#0f172a] text-slate-100 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div className="min-w-0">
                <h2 id="pwa-modal-title" className="text-sm font-bold tracking-tight">
                  Install Aplikasi (PC &amp; Android) &amp; Pembaruan Otomatis
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Sumber pembaruan resmi:{' '}
                  <span className="font-mono text-sky-300">officecontent.netlify.app</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Tutup dialog instalasi aplikasi"
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3 p-4 text-xs">
              {/* Native 1-Click Install CTA when available & not yet installed */}
              {!pwa.isInstalled && (
                <div className="rounded-xl border border-sky-500/40 bg-sky-950/35 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sky-100">
                        Pasang Kantor AI 3D ke Layar Utama / Desktop
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-300">
                        Setelah diinstal dari{' '}
                        <span className="font-mono text-sky-300">officecontent.netlify.app</span>,
                        setiap pembaruan di browser akan otomatis masuk ke aplikasi PC &amp;
                        Android Anda.
                      </p>
                    </div>
                    {pwa.isInstallable ? (
                      <button
                        type="button"
                        data-testid="pwa-native-install-btn"
                        onClick={() => void pwa.install()}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Install Sekarang</span>
                      </button>
                    ) : (
                      <a
                        href={pwa.canonicalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-[11px] font-semibold text-slate-950 transition-colors hover:bg-sky-400"
                      >
                        <span>Buka officecontent.netlify.app</span>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Platform-specific guides (PC, Android, iOS) */}
              {!pwa.isInstalled && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                      <Laptop className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                      <span>Install di PC (Windows / Mac)</span>
                    </div>
                    <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[11px] text-slate-300">
                      <li>
                        Buka <span className="font-mono text-sky-300">officecontent.netlify.app</span>{' '}
                        di Chrome atau Edge.
                      </li>
                      <li>
                        Klik ikon <strong>Install</strong> di kanan bilah alamat (atau tombol{' '}
                        <strong>Install Sekarang</strong>).
                      </li>
                      <li>Aplikasi tampil di Desktop / Start Menu seperti aplikasi PC.</li>
                    </ol>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                      <Smartphone className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                      <span>Install di Android / iPhone</span>
                    </div>
                    <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[11px] text-slate-300">
                      <li>
                        <strong>Android (Chrome):</strong> ketuk menu <strong>⋮</strong> lalu pilih{' '}
                        <strong>Tambahkan ke layar utama / Install app</strong>.
                      </li>
                      <li>
                        <strong>iPhone / iPad (Safari):</strong> ketuk tombol{' '}
                        <strong>Share</strong> lalu pilih <strong>Add to Home Screen</strong>.
                      </li>
                    </ol>
                  </div>
                </div>
              )}

              {/* Browser Sync & Update Checker */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-100">
                      Sinkronisasi Pembaruan Browser
                    </p>
                    <p className="mt-0.5 font-mono text-[10.5px] text-slate-400">
                      Versi v{pwa.appVersion}
                      {pwa.lastCheckedAt ? ` · Cek terakhir ${pwa.lastCheckedAt}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="pwa-check-update-btn"
                      disabled={pwa.updateStatus === 'checking'}
                      onClick={() => void pwa.checkForUpdates()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-700 disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${
                          pwa.updateStatus === 'checking' ? 'animate-spin' : ''
                        }`}
                        aria-hidden="true"
                      />
                      <span>
                        {pwa.updateStatus === 'checking' ? 'Memeriksa...' : 'Cek Pembaruan'}
                      </span>
                    </button>
                    {hasUpdate && (
                      <button
                        type="button"
                        data-testid="pwa-apply-update-btn"
                        onClick={() => void pwa.applyUpdate()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
                      >
                        <span>Perbarui Sekarang</span>
                      </button>
                    )}
                  </div>
                </div>

                {pwa.updateMessage && (
                  <p className="mt-2 rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-1.5 text-[11px] text-slate-300">
                    {pwa.updateMessage}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-slate-400">
                  <span>
                    Aplikasi otomatis memeriksa pembaruan baru setiap kali dibuka atau kembali online.
                  </span>
                  <a
                    href={pwa.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-sky-300 underline-offset-2 hover:underline"
                  >
                    <span>officecontent.netlify.app</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface PWAStatusToastProps {
  pwa: UsePWAResult;
}

export function PWAStatusToast({ pwa }: PWAStatusToastProps) {
  const showUpdate = pwa.needRefresh || pwa.remoteUpdateAvailable;
  const showOffline = !pwa.isOnline;

  if (!showUpdate && !showOffline) return null;

  return (
    <div className="pointer-events-auto fixed right-4 bottom-4 z-40 flex max-w-sm flex-col gap-2">
      {showUpdate && (
        <div
          role="status"
          data-testid="pwa-update-banner"
          className="flex items-start gap-2.5 rounded-xl border border-sky-500/60 bg-[#0f172a] px-3.5 py-2.5 text-xs text-slate-100 shadow-2xl"
        >
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Pembaruan Baru Tersedia</p>
            <p className="mt-0.5 text-[11px] text-slate-300">
              Versi terbaru dari <span className="font-mono text-sky-300">officecontent.netlify.app</span>{' '}
              siap diterapkan.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void pwa.applyUpdate()}
                className="rounded-lg bg-sky-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950 transition-colors hover:bg-sky-400"
              >
                Perbarui Sekarang
              </button>
              <button
                type="button"
                onClick={pwa.dismissUpdateBanner}
                className="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-white"
              >
                Nanti
              </button>
            </div>
          </div>
        </div>
      )}

      {showOffline && (
        <div
          role="status"
          data-testid="pwa-offline-indicator"
          className="flex items-center gap-2 rounded-xl border border-amber-500/60 bg-amber-950/95 px-3 py-2 text-xs font-medium text-amber-100 shadow-xl"
        >
          <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
          <span>Mode Offline — Data cache lokal sedang digunakan.</span>
        </div>
      )}
    </div>
  );
}
