import { expect, test } from '@zebrunner/javascript-agent-playwright/remote';

import { downloadFilename, downloadInPage, downloadText } from '../src/scenario';

const ORIGIN = 'https://playwright.dev/';
const MARKER_KEY = 'zebrunner_marker';
const MARKER_VALUE = 'isolation-42';

// Run in refresh mode: REMOTE_REFRESH=true (engine via REMOTE_PLAYWRIGHT_BROWSER_NAME). The first
// test seeds state on one generation; after the fixture refreshes, the next test must see a fresh
// browser with an empty downloads path and none of the seeded state.
test.describe.serial('Playwright refresh isolation', () => {
  let originalSessionId = '';
  let lastGeneration = 0;

  test('seeds a download, a cookie, and localStorage', async ({ page, remoteSession }) => {
    originalSessionId = remoteSession.originalSessionId;
    lastGeneration = remoteSession.generation ?? 0;

    const download = await downloadInPage(page, downloadText, downloadFilename);
    expect(await download.failure(), 'browser download failed').toBeNull();
    expect(
      (await remoteSession.listDownloads()).length,
      'fileserver listed no downloads before refresh',
    ).toBeGreaterThan(0);

    await page.context().addCookies([{ name: MARKER_KEY, value: MARKER_VALUE, url: ORIGIN }]);
    await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [MARKER_KEY, MARKER_VALUE] as const);
    expect(await page.evaluate((key) => localStorage.getItem(key), MARKER_KEY)).toBe(MARKER_VALUE);
  });

  test('returns a clean, isolated browser after refresh', async ({ remoteBrowser, remoteSession }) => {
    expect(remoteSession.originalSessionId, 'refresh changed the original session').toBe(originalSessionId);
    expect(remoteSession.generation ?? 0, 'refresh did not advance the generation').toBeGreaterThan(lastGeneration);

    // The refreshed generation is a brand-new browser with no leftover contexts.
    expect(remoteBrowser.contexts().length, 'refreshed browser still had contexts').toBe(0);
    // The refreshed generation reuses the downloads path, which must start empty.
    expect(await remoteSession.listDownloads(), 'downloads path was not clean after refresh').toEqual([]);

    const context = await remoteBrowser.newContext();
    try {
      const cookies = await context.cookies(ORIGIN);
      expect(cookies.some((cookie) => cookie.name === MARKER_KEY), 'seeded cookie survived refresh').toBe(false);

      const page = await context.newPage();
      await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
      expect(
        await page.evaluate((key) => localStorage.getItem(key), MARKER_KEY),
        'seeded localStorage survived refresh',
      ).toBeNull();
    } finally {
      await context.close();
    }
  });
});
