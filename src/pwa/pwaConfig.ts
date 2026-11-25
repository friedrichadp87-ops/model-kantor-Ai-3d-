export const CANONICAL_UPDATE_URL = 'https://officecontent.netlify.app/';
export const CANONICAL_UPDATE_HOST = 'officecontent.netlify.app';
export const CANONICAL_VERSION_ENDPOINT = `${CANONICAL_UPDATE_URL}version.json`;

export type DeviceInstallPlatform = 'android' | 'ios' | 'desktop';

export interface DeviceInstallContext {
  platform: DeviceInstallPlatform;
  isInstalled: boolean;
}

export interface RemoteVersionPayload {
  version: string;
  buildId: string;
  updateUrl?: string;
  builtAt?: string;
}

export interface VersionCheckComparison {
  hasRemoteUpdate: boolean;
  remoteBuildId: string | null;
  remoteBuiltAt: string | null;
}

export function detectDeviceInstallContext(params: {
  userAgent: string;
  displayModeStandalone: boolean;
  navigatorStandalone?: boolean;
}): DeviceInstallContext {
  const ua = params.userAgent.toLowerCase();
  const isInstalled = Boolean(params.displayModeStandalone || params.navigatorStandalone);

  if (/iphone|ipad|ipod/.test(ua)) {
    return { platform: 'ios', isInstalled };
  }
  if (/android/.test(ua)) {
    return { platform: 'android', isInstalled };
  }
  return { platform: 'desktop', isInstalled };
}

export function isRunningOnCanonicalHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === CANONICAL_UPDATE_HOST || normalized.endsWith(`.${CANONICAL_UPDATE_HOST}`);
}

export function parseRemoteVersionPayload(raw: unknown): RemoteVersionPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const version = typeof obj.version === 'string' ? obj.version.trim() : '';
  const buildId = typeof obj.buildId === 'string' ? obj.buildId.trim() : '';
  if (!version || !buildId) return null;
  return {
    version,
    buildId,
    updateUrl: typeof obj.updateUrl === 'string' ? obj.updateUrl.trim() : CANONICAL_UPDATE_URL,
    builtAt: typeof obj.builtAt === 'string' ? obj.builtAt.trim() : undefined,
  };
}

export function compareBuildVersions(
  localBuildId: string,
  remote: RemoteVersionPayload | null
): VersionCheckComparison {
  if (!remote) {
    return { hasRemoteUpdate: false, remoteBuildId: null, remoteBuiltAt: null };
  }
  const cleanLocal = localBuildId.trim();
  const cleanRemote = remote.buildId.trim();
  if (!cleanLocal || !cleanRemote || cleanLocal === cleanRemote) {
    return {
      hasRemoteUpdate: false,
      remoteBuildId: cleanRemote || null,
      remoteBuiltAt: remote.builtAt ?? null,
    };
  }
  return {
    hasRemoteUpdate: true,
    remoteBuildId: cleanRemote,
    remoteBuiltAt: remote.builtAt ?? null,
  };
}

export function getInstallActionLabel(platform: DeviceInstallPlatform): string {
  if (platform === 'android') return 'Install di Android';
  if (platform === 'ios') return 'Install di iPhone / iPad';
  return 'Install di PC & Android';
}
