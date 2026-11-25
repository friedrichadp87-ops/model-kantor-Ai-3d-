import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import {
  CANONICAL_UPDATE_URL,
  compareBuildVersions,
  detectDeviceInstallContext,
  isRunningOnCanonicalHost,
  parseRemoteVersionPayload,
  type DeviceInstallPlatform,
} from './pwaConfig';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type PwaUpdateCheckStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'sw-update-ready'
  | 'remote-update-ready'
  | 'offline'
  | 'error';

export interface UsePWAResult {
  isInstallable: boolean;
  isInstalled: boolean;
  platform: DeviceInstallPlatform;
  isIOS: boolean;
  isAndroid: boolean;
  isOnline: boolean;
  needRefresh: boolean;
  offlineReady: boolean;
  remoteUpdateAvailable: boolean;
  updateStatus: PwaUpdateCheckStatus;
  updateMessage: string | null;
  lastCheckedAt: string | null;
  appVersion: string;
  buildId: string;
  canonicalUrl: string;
  isOnCanonicalHost: boolean;
  install: () => Promise<boolean>;
  checkForUpdates: () => Promise<void>;
  applyUpdate: () => Promise<void>;
  dismissUpdateBanner: () => void;
}

const UPDATE_POLL_INTERVAL_MS = 5 * 60 * 1000;

export function usePWA(): UsePWAResult {
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
  const buildId = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';
  const canonicalUrl =
    typeof __CANONICAL_UPDATE_URL__ !== 'undefined'
      ? __CANONICAL_UPDATE_URL__
      : CANONICAL_UPDATE_URL;

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [platform, setPlatform] = useState<DeviceInstallPlatform>('desktop');
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [needRefresh, setNeedRefresh] = useState<boolean>(false);
  const [offlineReady, setOfflineReady] = useState<boolean>(false);
  const [remoteUpdateAvailable, setRemoteUpdateAvailable] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<PwaUpdateCheckStatus>('idle');
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false);

  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);
  const updateSwFnRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  const isOnCanonicalHost =
    typeof window !== 'undefined' ? isRunningOnCanonicalHost(window.location.hostname) : false;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ctx = detectDeviceInstallContext({
      userAgent: window.navigator.userAgent,
      displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
      navigatorStandalone: (window.navigator as unknown as { standalone?: boolean }).standalone,
    });
    setPlatform(ctx.platform);
    setIsInstalled(ctx.isInstalled);

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayChange = (ev: MediaQueryListEvent) => {
      if (ev.matches) setIsInstalled(true);
    };
    mediaQuery.addEventListener?.('change', handleDisplayChange);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const handleOnline = () => {
      setIsOnline(true);
      void swRegRef.current?.update();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mediaQuery.removeEventListener?.('change', handleDisplayChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let pollTimer: number | undefined;

    try {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          setNeedRefresh(true);
          setBannerDismissed(false);
          setUpdateStatus('sw-update-ready');
          setUpdateMessage(
            'Pembaruan aplikasi baru siap dipasang. Klik Perbarui Sekarang untuk memuat versi terbaru.'
          );
        },
        onOfflineReady() {
          setOfflineReady(true);
        },
        onRegisteredSW(_swUrl, registration) {
          if (!registration) return;
          swRegRef.current = registration;
          pollTimer = window.setInterval(() => {
            if (navigator.onLine) {
              void registration.update();
            }
          }, UPDATE_POLL_INTERVAL_MS);
        },
      });
      updateSwFnRef.current = updateSW;
    } catch {
      // Non-fatal in environments that restrict service workers
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void swRegRef.current?.update();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  const checkForUpdates = useCallback(async (): Promise<void> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setUpdateStatus('offline');
      setUpdateMessage('Perangkat sedang offline. Sambungkan internet untuk memeriksa pembaruan.');
      return;
    }

    setUpdateStatus('checking');
    setUpdateMessage('Memeriksa pembaruan terbaru dari officecontent.netlify.app...');

    let swFoundUpdate = false;
    try {
      const reg = swRegRef.current;
      if (reg) {
        await reg.update();
        if (reg.waiting || reg.installing) {
          swFoundUpdate = true;
        }
      }
    } catch {
      // Continue with version manifest check
    }

    const checkedTime = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setLastCheckedAt(checkedTime);

    if (swFoundUpdate || needRefresh) {
      setNeedRefresh(true);
      setBannerDismissed(false);
      setUpdateStatus('sw-update-ready');
      setUpdateMessage(
        'Versi baru terdeteksi oleh Service Worker. Klik Perbarui Sekarang untuk menerapkan.'
      );
      return;
    }

    // On officecontent.netlify.app, fetch same-origin /version.json directly;
    // on other hosts (localhost/preview), query our backend proxy so no CORS errors appear in console.
    try {
      const res = await fetch(
        isOnCanonicalHost ? `/version.json?t=${Date.now()}` : `/api/pwa/remote-version?t=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const json = (await res.json()) as unknown;
        const candidate = isOnCanonicalHost
          ? json
          : (json as { reachable?: boolean; payload?: unknown })?.payload ?? null;
        const parsed = parseRemoteVersionPayload(candidate);
        const cmp = compareBuildVersions(buildId, parsed);
        if (cmp.hasRemoteUpdate) {
          setRemoteUpdateAvailable(true);
          setBannerDismissed(false);
          setUpdateStatus('remote-update-ready');
          setUpdateMessage(
            `Pembaruan baru tersedia di officecontent.netlify.app (build ${cmp.remoteBuildId}).`
          );
          return;
        }
        if (parsed) {
          setRemoteUpdateAvailable(false);
          setUpdateStatus('up-to-date');
          setUpdateMessage('Aplikasi Anda sudah menggunakan versi terbaru.');
          return;
        }
      }
    } catch {
      // Graceful fallback when running standalone without backend proxy
    }

    setUpdateStatus('up-to-date');
    setUpdateMessage(
      isOnCanonicalHost
        ? 'Tidak ada pembaruan tertunda. Aplikasi sudah mutakhir.'
        : 'Siap sinkron otomatis setelah versi terbaru ini di-deploy ke officecontent.netlify.app.'
    );
  }, [buildId, isOnCanonicalHost, needRefresh]);

  const applyUpdate = useCallback(async (): Promise<void> => {
    if (needRefresh && updateSwFnRef.current) {
      await updateSwFnRef.current(true);
      return;
    }
    if (typeof window !== 'undefined') {
      if ('caches' in window) {
        try {
          const keys = await window.caches.keys();
          await Promise.all(keys.map((k) => window.caches.delete(k)));
        } catch {
          // Ignore cache clear failure
        }
      }
      if (isOnCanonicalHost) {
        window.location.reload();
      } else {
        window.location.href = canonicalUrl;
      }
    }
  }, [canonicalUrl, isOnCanonicalHost, needRefresh]);

  const dismissUpdateBanner = useCallback(() => {
    setBannerDismissed(true);
  }, []);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    platform,
    isIOS: platform === 'ios',
    isAndroid: platform === 'android',
    isOnline,
    needRefresh: needRefresh && !bannerDismissed,
    offlineReady,
    remoteUpdateAvailable: remoteUpdateAvailable && !bannerDismissed,
    updateStatus,
    updateMessage,
    lastCheckedAt,
    appVersion,
    buildId,
    canonicalUrl,
    isOnCanonicalHost,
    install,
    checkForUpdates,
    applyUpdate,
    dismissUpdateBanner,
  };
}
