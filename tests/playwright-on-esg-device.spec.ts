import { devices, expect, test } from '@playwright/test';
import { currentTest } from '@zebrunner/javascript-agent-playwright';

import {
  createEsgSession,
  createTimeoutMs,
  deleteEsgSession,
  engineFor,
  esgWsHost,
  reportingCapabilities,
  requireEsgCredentials,
} from '../src/playwright-esg';

// iPhone descriptors default to WebKit and Pixel descriptors to Chromium, so the ESG session
// engine must match the descriptor. A mismatch connects the wrong browser to the descriptor.
async function runDeviceEmulation(deviceName: string): Promise<void> {
  const device = devices[deviceName];
  expect(device, `Unknown Playwright device: ${deviceName}`).toBeTruthy();

  const sessionId = await createEsgSession(device.defaultBrowserType);
  try {
    const browser = await engineFor(device.defaultBrowserType).connect(`${esgWsHost}/ws/playwright/${sessionId}`);
    try {
      const caps = reportingCapabilities(browser.browserType().name(), browser.version());
      currentTest.attachSessionCapabilities(caps, sessionId);
      currentTest.log.info(`Session ${sessionId} emulates ${deviceName} on ${caps.browserName}.`);

      const context = await browser.newContext({ ...device });
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
    } finally {
      await browser.close();
    }
  } finally {
    await deleteEsgSession(sessionId);
  }
}

test.describe('Playwright device emulation on ESG', () => {
  test('emulates an iPhone on WebKit', async () => {
    test.setTimeout(createTimeoutMs + 120_000);
    requireEsgCredentials();
    await runDeviceEmulation('iPhone 13');
  });

  test('emulates an Android phone on Chromium', async () => {
    test.setTimeout(createTimeoutMs + 120_000);
    requireEsgCredentials();
    await runDeviceEmulation('Pixel 5');
  });
});
