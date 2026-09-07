import { expect, test } from '@zebrunner/javascript-agent-playwright/remote';

import { CLIPBOARD_TEXT, verifyClipboard, verifyDownload } from '../src/fileserver';

// Refresh mode (the `refresh` project): the second test runs on the refreshed session and must
// still reach both endpoints.
test.describe.serial('Playwright fileserver and clipboard after refresh', () => {
  let lastGeneration = 0;

  test('establishes the first generation', async ({ page, remoteSession }) => {
    lastGeneration = remoteSession.generation ?? 0;
    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
  });

  test('download and clipboard still work after refresh', async ({ page, remoteSession }) => {
    expect(remoteSession.generation ?? 0, 'refresh did not advance the generation').toBeGreaterThan(lastGeneration);
    await verifyDownload(page, remoteSession);
    await verifyClipboard(remoteSession, CLIPBOARD_TEXT);
  });
});
