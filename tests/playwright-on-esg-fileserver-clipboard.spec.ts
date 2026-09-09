import { test } from '@zebrunner/javascript-agent-playwright/session-fixture';

import { CLIPBOARD_TEXT, verifyClipboard, verifyDownload } from '../src/fileserver';

test.describe('Playwright fileserver and clipboard on ESG', () => {
  test('serves a browser download over the download endpoint', async ({ page, remoteSession }) => {
    await verifyDownload(page, remoteSession);
  });

  test('round-trips text through the clipboard endpoint', async ({ page, remoteSession }) => {
    // Open a page so the session runs a browser while the clipboard endpoint is exercised.
    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
    await verifyClipboard(remoteSession, CLIPBOARD_TEXT);
  });
});
