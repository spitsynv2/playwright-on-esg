import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { currentTest } from '@zebrunner/javascript-agent-playwright';

import {
  browserName,
  createEsgSession,
  createTimeoutMs,
  deleteEsgDownload,
  deleteEsgSession,
  downloadFilename,
  downloadInPage,
  downloadText,
  engineFor,
  esgWsHost,
  fetchEsgDownload,
  getEsgClipboard,
  listEsgDownloads,
  refreshEsgSession,
  refreshTimeoutMs,
  reportingCapabilities,
  requireEsgCredentials,
  setEsgClipboard,
  viewportFor,
} from '../src/playwright-esg';

const CLIPBOARD_TEXT = 'Zebrunner clipboard round-trip 42';

// xseld comes up once the X server is ready, so retry the round-trip against a fresh session.
async function verifyClipboard(sessionId: string, text: string): Promise<void> {
  await expect(async () => {
    await setEsgClipboard(sessionId, text);
    expect(await getEsgClipboard(sessionId)).toBe(text);
  }).toPass({ timeout: 30_000, intervals: [1000, 2000, 3000] });
}

// Downloads a file in the page, verifies the fileserver serves it, attaches it, then removes it.
async function verifyDownload(page: Page, sessionId: string): Promise<void> {
  const download = await downloadInPage(page, downloadText, downloadFilename);
  // failure() resolves once the download finishes writing; null means success.
  expect(await download.failure(), 'browser download failed').toBeNull();

  // The browser removes its downloads on close, so query the fileserver while open.
  const files = await listEsgDownloads(sessionId);
  expect(files.length, 'fileserver listed no downloads').toBeGreaterThan(0);

  const name = files[0];
  const fetched = await fetchEsgDownload(sessionId, name);
  expect(fetched.status, `GET download ${name}`).toBe(200);
  expect(fetched.body).toContain(downloadText);

  // Attach the file retrieved through the fileserver to the Zebrunner test report.
  currentTest.attachArtifact(Buffer.from(fetched.body, 'utf8'), download.suggestedFilename());

  expect(await deleteEsgDownload(sessionId, name), `DELETE download ${name}`).toBe(200);
  expect(await listEsgDownloads(sessionId)).not.toContain(name);
}

test.describe('Playwright fileserver and clipboard on ESG', () => {
  test('serves a browser download over the download endpoint', async () => {
    test.setTimeout(createTimeoutMs + 120_000);
    requireEsgCredentials();

    const sessionId = await createEsgSession();
    try {
      const browser = await engineFor(browserName).connect(`${esgWsHost}/ws/playwright/${sessionId}`);
      try {
        const engineName = browser.browserType().name();
        currentTest.attachSessionCapabilities(reportingCapabilities(engineName, browser.version()), sessionId);

        const context = await browser.newContext({ acceptDownloads: true, viewport: viewportFor(engineName) });
        try {
          await verifyDownload(await context.newPage(), sessionId);
        } finally {
          await context.close();
        }
      } finally {
        await browser.close();
      }
    } finally {
      await deleteEsgSession(sessionId);
    }
  });

  test('round-trips text through the clipboard endpoint', async () => {
    test.setTimeout(createTimeoutMs + 120_000);
    requireEsgCredentials();

    const sessionId = await createEsgSession();
    try {
      // Open a browser at the shared viewport so the session runs at the same resolution as other tests.
      const browser = await engineFor(browserName).connect(`${esgWsHost}/ws/playwright/${sessionId}`);
      try {
        const engineName = browser.browserType().name();
        currentTest.attachSessionCapabilities(reportingCapabilities(engineName, browser.version()), sessionId);

        const page = await browser.newPage({ viewport: viewportFor(engineName) });
        await page.goto('https://playwright.dev/', { waitUntil: 'commit' });

        await verifyClipboard(sessionId, CLIPBOARD_TEXT);
      } finally {
        await browser.close();
      }
    } finally {
      await deleteEsgSession(sessionId);
    }
  });

  test('download and clipboard still work after refresh', async () => {
    test.setTimeout(createTimeoutMs + refreshTimeoutMs + 180_000);
    requireEsgCredentials();

    const originalSessionId = await createEsgSession();
    try {
      // Establish generation 1, then swap to a fresh browser.
      const first = await engineFor(browserName).connect(`${esgWsHost}/ws/playwright/${originalSessionId}`);
      try {
        currentTest.attachSessionCapabilities(
          reportingCapabilities(first.browserType().name(), first.version()),
          originalSessionId,
        );
      } finally {
        await first.close();
      }

      const refreshed = await refreshEsgSession(originalSessionId, browserName);
      expect(refreshed.generation, 'refresh did not advance the generation').toBe(2);
      const refreshedSessionId = refreshed.sessionId || originalSessionId;

      // Generation 2: both the fileserver and clipboard must work against the refreshed session.
      const second = await engineFor(browserName).connect(`${esgWsHost}/ws/playwright/${refreshedSessionId}`);
      try {
        const engineName = second.browserType().name();
        // attachSessionCapabilities registers only one session per test, so a second call after
        // refresh is redundant here; kept for reference should the agent gain multi-session support.
        // currentTest.attachSessionCapabilities(reportingCapabilities(engineName, second.version()), refreshedSessionId);

        const context = await second.newContext({ acceptDownloads: true, viewport: viewportFor(engineName) });
        try {
          await verifyDownload(await context.newPage(), refreshedSessionId);
        } finally {
          await context.close();
        }

        await verifyClipboard(refreshedSessionId, CLIPBOARD_TEXT);
      } finally {
        await second.close();
      }
    } finally {
      await deleteEsgSession(originalSessionId);
    }
  });
});
