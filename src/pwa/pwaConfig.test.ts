import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_UPDATE_URL,
  CANONICAL_VERSION_ENDPOINT,
  compareBuildVersions,
  detectDeviceInstallContext,
  getInstallActionLabel,
  isRunningOnCanonicalHost,
  parseRemoteVersionPayload,
} from './pwaConfig';

test('PWA canonical update endpoints target https://officecontent.netlify.app/', () => {
  assert.equal(CANONICAL_UPDATE_URL, 'https://officecontent.netlify.app/');
  assert.equal(CANONICAL_VERSION_ENDPOINT, 'https://officecontent.netlify.app/version.json');
  assert.equal(isRunningOnCanonicalHost('officecontent.netlify.app'), true);
  assert.equal(isRunningOnCanonicalHost('localhost'), false);
});

test('detectDeviceInstallContext classifies PC, Android, iOS and standalone mode', () => {
  const androidBrowser = detectDeviceInstallContext({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0',
    displayModeStandalone: false,
  });
  assert.equal(androidBrowser.platform, 'android');
  assert.equal(androidBrowser.isInstalled, false);

  const pcStandalone = detectDeviceInstallContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0',
    displayModeStandalone: true,
  });
  assert.equal(pcStandalone.platform, 'desktop');
  assert.equal(pcStandalone.isInstalled, true);

  const iosSafari = detectDeviceInstallContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/604.1',
    displayModeStandalone: false,
    navigatorStandalone: true,
  });
  assert.equal(iosSafari.platform, 'ios');
  assert.equal(iosSafari.isInstalled, true);
});

test('compareBuildVersions detects newer Netlify builds cleanly', () => {
  const validPayload = parseRemoteVersionPayload({
    version: '1.0.0',
    buildId: '2026-11-26T04-00-00-000Z',
    builtAt: '2026-11-26T04:00:00.000Z',
  });
  assert.ok(validPayload);
  assert.equal(compareBuildVersions('2026-11-25T11-45-00-000Z', validPayload).hasRemoteUpdate, true);
  assert.equal(compareBuildVersions('2026-11-26T04-00-00-000Z', validPayload).hasRemoteUpdate, false);
  assert.equal(parseRemoteVersionPayload({ version: '' }), null);
  assert.equal(getInstallActionLabel('desktop'), 'Install di PC & Android');
  assert.equal(getInstallActionLabel('android'), 'Install di Android');
});
