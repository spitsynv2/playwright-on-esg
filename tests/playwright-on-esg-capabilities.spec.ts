import { expect } from '@playwright/test';
import { test } from '@zebrunner/javascript-agent-playwright/session-fixture';

// REMOTE_SESSION_ENABLED=false selects a local browser. These tests use shared
// fixtures, so the same checks run against local and remote browsers.
test.describe('Playwright context options: local and remote parity', () => {
  test.describe('configured context options', () => {
    test.use({
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      colorScheme: 'dark',
      userAgent: 'ZebrunnerCapsProbe/1.0',
      viewport: { width: 800, height: 600 },
    });

    test('page fixture applies context options and viewport', async ({ page }) => {
      await page.goto('about:blank');

      const applied = await page.evaluate(() => ({
        language: navigator.language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
        userAgent: navigator.userAgent,
        width: window.innerWidth,
        height: window.innerHeight,
      }));

      expect(applied.language).toBe('de-DE');
      expect(applied.timeZone).toBe('Europe/Berlin');
      expect(applied.prefersDark).toBe(true);
      expect(applied.userAgent).toBe('ZebrunnerCapsProbe/1.0');
      expect(applied.width).toBe(800);
      expect(applied.height).toBe(600);
    });

    test('sessionBrowser applies an explicit context viewport', async ({ sessionBrowser }) => {
      const context = await sessionBrowser.newContext({
        viewport: { width: 900, height: 700 },
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
        expect(applied.width).toBe(900);
        expect(applied.height).toBe(700);
        expect(applied.dpr).toBeCloseTo(2);
      } finally {
        await context.close();
      }
    });
  });

  test.describe('1920x1080 viewport', () => {
    test.use({
      viewport: { width: 1920, height: 1080 },
    });
    test('sessionBrowser applies the default Playwright context viewport', async ({ sessionBrowser }) => {
      const context = await sessionBrowser.newContext();
      const page = await context.newPage();
      try {
        await page.goto('about:blank');
        const viewport = await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight,
        }));
        expect(viewport.width).toBe(1920);
        expect(viewport.height).toBe(1080);
      } finally {
        await context.close();
      }
    });
  });

  test('sessionBrowser applies the default Playwright context viewport', async ({ sessionBrowser }) => {
    const context = await sessionBrowser.newContext();
    const page = await context.newPage();
    try {
      await page.goto('about:blank');
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      expect(viewport.width).toBe(1280);
      expect(viewport.height).toBe(720);
    } finally {
      await context.close();
    }
  });
});
