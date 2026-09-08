import { test } from '@zebrunner/javascript-agent-playwright/remote';
import { expect } from '@playwright/test';

// Context-option parity suite. It proves standard Playwright `use.*` context
// options apply identically on a local run (REMOTE=false) and a remote grid run.
//
// Two paths, because `viewport` is special:
//   1. Shared `page` fixture: the agent forwards `use.*` options to the context
//      it creates, EXCEPT viewport -- a remote session dictates its own viewport
//      so VNC/video show a real screen. So locale/timezone/colorScheme/userAgent
//      are asserted through the `page` fixture, but not viewport.
//   2. Own context via `sessionBrowser.newContext({ viewport, ... })`: this
//      bypasses the fixture's viewport override, so the viewport is forced the
//      same on local and remote (the same path the device suite uses).
test.use({
  locale: 'de-DE',
  timezoneId: 'Europe/Berlin',
  colorScheme: 'dark',
  userAgent: 'ZebrunnerCapsProbe/1.0',
  viewport: { width: 800, height: 600 },
});

test.describe('Playwright context options: local/remote parity', () => {
  test('locale, timezone, color scheme, and user agent are applied', async ({ page }) => {
    await page.goto('about:blank');

    const applied = await page.evaluate(() => ({
      language: navigator.language,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
      userAgent: navigator.userAgent,
    }));

    expect(applied.language).toBe('de-DE');
    expect(applied.timeZone).toBe('Europe/Berlin');
    expect(applied.prefersDark).toBe(true);
    expect(applied.userAgent).toBe('ZebrunnerCapsProbe/1.0');
  });

  test('viewport and deviceScaleFactor via sessionBrowser.newContext are applied', async ({ sessionBrowser }) => {
    // Own context, so the viewport is forced identically on local and remote
    // (the shared page fixture would let the remote session override it).
    const context = await sessionBrowser.newContext({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    try {
      await page.goto('about:blank');
      const applied = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio,
      }));
      expect(applied.width).toBe(800);
      expect(applied.height).toBe(600);
      expect(applied.dpr).toBeCloseTo(2);
    } finally {
      await context.close();
    }
  });
});
