import { expect, test } from '@zebrunner/javascript-agent-playwright/remote';
import { devices, type Browser } from '@playwright/test';

// iPhone descriptors default to WebKit and Pixel descriptors to Chromium. The device-webkit and
// device-chromium projects pin the session engine with capabilities and grep to the matching test.
// The skip guards a direct run where the session engine does not match the descriptor.
//
// This builds its own context to force the device viewport (the remote session
// viewport would otherwise override it). Local video still works: the agent's
// sessionBrowser wrapper records + attaches it on a REMOTE=false run.
async function runDeviceEmulation(sessionBrowser: Browser, deviceName: string): Promise<void> {
  const device = devices[deviceName];
  expect(device, `Unknown Playwright device: ${deviceName}`).toBeTruthy();
  test.skip(
    sessionBrowser.browserType().name() !== device.defaultBrowserType,
    `${deviceName} needs a ${device.defaultBrowserType} session; run the device-${device.defaultBrowserType} project`,
  );

  const context = await sessionBrowser.newContext({ ...device });
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
    await context.close();
  }
}

test.describe('Playwright device emulation on ESG', () => {
  test('emulates an iPhone on WebKit', async ({ sessionBrowser }) => {
    await runDeviceEmulation(sessionBrowser, 'iPhone 13');
  });

  test('emulates an Android phone on Chromium', async ({ sessionBrowser }) => {
    await runDeviceEmulation(sessionBrowser, 'Pixel 5');
  });
});
