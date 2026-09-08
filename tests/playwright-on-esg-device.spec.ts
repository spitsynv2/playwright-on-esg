import { expect, test, useRemoteBrowser } from '@zebrunner/javascript-agent-playwright/remote';
import type { RemoteOptions } from '@zebrunner/javascript-agent-playwright/remote';
import { devices, type Browser } from '@playwright/test';

// iPhone descriptors default to WebKit and Pixel descriptors to Chromium. The device-webkit and
// device-chromium projects pin the session engine with capabilities and grep to the matching test.
// The skip guards a direct run where the session engine does not match the descriptor.
//
// This suite builds the context itself (remoteBrowser.newContext) to force the
// device viewport, which the remote session viewport would otherwise override.
// That manual path opts out of the fixture's local-video wiring, so a local run
// (REMOTE=false) records and attaches the Playwright video here. A remote run
// records nothing client-side; Zebrunner shows the grid session recording.
async function runDeviceEmulation(
  remoteBrowser: Browser,
  deviceName: string,
  remoteOptions: RemoteOptions,
): Promise<void> {
  const device = devices[deviceName];
  expect(device, `Unknown Playwright device: ${deviceName}`).toBeTruthy();
  test.skip(
    remoteBrowser.browserType().name() !== device.defaultBrowserType,
    `${deviceName} needs a ${device.defaultBrowserType} session; run the device-${device.defaultBrowserType} project`,
  );

  const testInfo = test.info();
  const rawVideo = (testInfo.project.use as { video?: string | { mode?: string } }).video;
  const videoMode = typeof rawVideo === 'string' ? rawVideo : rawVideo?.mode;
  // Record client-side only on a local run. On the grid the server-side session
  // recording already covers video.
  const recordLocalVideo = !useRemoteBrowser(remoteOptions) && !!videoMode && videoMode !== 'off';

  const context = await remoteBrowser.newContext({
    ...device,
    ...(recordLocalVideo ? { recordVideo: { dir: testInfo.outputDir } } : {}),
  });
  const page = await context.newPage();
  try {
    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
    await expect(page).toHaveTitle(/Playwright/);

    // WebKit on Linux reports maxTouchPoints 0 even with touch emulation, so combine signals.
    const emulated = await page.evaluate(() => ({
      width: window.innerWidth,
      dpr: window.devicePixelRatio,
      hasTouch:
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(any-pointer: coarse)').matches,
      userAgent: navigator.userAgent,
    }));

    expect(emulated.width).toBe(device.viewport.width);
    expect(emulated.dpr).toBeCloseTo(device.deviceScaleFactor);
    expect(emulated.userAgent).toBe(device.userAgent);
    expect(emulated.hasTouch).toBe(true);
  } finally {
    // Grab the video handle before close; its path resolves only after close.
    const video = recordLocalVideo ? page.video() : null;
    await context.close();
    if (video) {
      const keep =
        videoMode === 'on' ||
        (videoMode === 'retain-on-failure' && testInfo.status !== testInfo.expectedStatus) ||
        (videoMode === 'on-first-retry' && testInfo.retry === 1);
      try {
        if (keep) {
          await testInfo.attach('video', { path: await video.path(), contentType: 'video/webm' });
        } else {
          await video.delete();
        }
      } catch {
        // Best-effort: never fail a device test because of local video handling.
      }
    }
  }
}

test.describe('Playwright device emulation on ESG', () => {
  test('emulates an iPhone on WebKit', async ({ remoteBrowser, remoteOptions }) => {
    await runDeviceEmulation(remoteBrowser, 'iPhone 13', remoteOptions);
  });

  test('emulates an Android phone on Chromium', async ({ remoteBrowser, remoteOptions }) => {
    await runDeviceEmulation(remoteBrowser, 'Pixel 5', remoteOptions);
  });
});
