import { expect, test } from '@playwright/test';
import { currentTest } from '@zebrunner/javascript-agent-playwright';

import {
  browsersUnderTest,
  createEsgSession,
  createTimeoutMs,
  deleteEsgSession,
  downloadFilename,
  downloadInPage,
  downloadText,
  engineFor,
  esgWsHost,
  listEsgDownloads,
  refreshEsgSession,
  refreshTimeoutMs,
  reportingCapabilities,
  requireEsgCredentials,
  viewportFor,
} from '../src/playwright-esg';

const ORIGIN = 'https://playwright.dev/';
const MARKER_KEY = 'zebrunner_marker';
const MARKER_VALUE = 'isolation-42';

// Refresh swaps the browser inside the same task: it returns a new child sessionId that still
// resolves to the original session, so the returned id is used to connect while the original id
// stays valid for the session lifecycle.
for (const engine of browsersUnderTest()) {
  test.describe(`Playwright refresh isolation (${engine})`, () => {
    test('clears the downloads path after refresh', async () => {
      test.setTimeout(createTimeoutMs + refreshTimeoutMs + 180_000);
      requireEsgCredentials();

      const originalSessionId = await createEsgSession(engine);
      try {
        const browser = await engineFor(engine).connect(`${esgWsHost}/ws/playwright/${originalSessionId}`);
        try {
          const engineName = browser.browserType().name();
          currentTest.attachSessionCapabilities(
            reportingCapabilities(engineName, browser.version()),
            originalSessionId,
          );

          const context = await browser.newContext({ acceptDownloads: true, viewport: viewportFor(engineName) });
          const page = await context.newPage();
          try {
            const download = await downloadInPage(page, downloadText, downloadFilename);
            expect(await download.failure(), 'browser download failed').toBeNull();
            expect(
              (await listEsgDownloads(originalSessionId)).length,
              'fileserver listed no downloads before refresh',
            ).toBeGreaterThan(0);
          } finally {
            await context.close();
          }
        } finally {
          // The refresh swaps the browser server, so disconnect this client first.
          await browser.close();
        }

        const refreshed = await refreshEsgSession(originalSessionId, engine);
        expect(refreshed.generation, 'refresh did not advance the generation').toBe(2);

        const refreshedSessionId = refreshed.sessionId || originalSessionId;
        // attachSessionCapabilities registers only one session per test, so a second call after
        // refresh is redundant here; kept for reference should the agent gain multi-session support.
        // currentTest.attachSessionCapabilities(reportingCapabilities(refreshed.browserType || engine), refreshedSessionId);

        // The refreshed generation reuses the downloads path, which must start empty.
        expect(await listEsgDownloads(refreshedSessionId), 'downloads path was not clean after refresh').toEqual([]);
      } finally {
        await deleteEsgSession(originalSessionId);
      }
    });

    test('returns a clean, isolated browser after refresh', async () => {
      test.setTimeout(createTimeoutMs + refreshTimeoutMs + 240_000);
      requireEsgCredentials();

      const originalSessionId = await createEsgSession(engine);
      try {
        // Generation 1: seed a cookie and a localStorage marker, and confirm they stick.
        const first = await engineFor(engine).connect(`${esgWsHost}/ws/playwright/${originalSessionId}`);
        try {
          const engineName = first.browserType().name();
          currentTest.attachSessionCapabilities(reportingCapabilities(engineName, first.version()), originalSessionId);

          const context = await first.newContext({ viewport: viewportFor(engineName) });
          try {
            await context.addCookies([{ name: MARKER_KEY, value: MARKER_VALUE, url: ORIGIN }]);
            const page = await context.newPage();
            await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
            await page.evaluate(
              ([key, value]) => localStorage.setItem(key, value),
              [MARKER_KEY, MARKER_VALUE] as const,
            );
            expect(await page.evaluate((key) => localStorage.getItem(key), MARKER_KEY)).toBe(MARKER_VALUE);
          } finally {
            await context.close();
          }
        } finally {
          // The refresh swaps the browser server, so disconnect this client first.
          await first.close();
        }

        // Refresh swaps to a brand-new browser generation; connect with the returned sessionId.
        const refreshed = await refreshEsgSession(originalSessionId, engine);
        expect(refreshed.generation, 'refresh did not advance the generation').toBe(2);
        const refreshedSessionId = refreshed.sessionId || originalSessionId;

        // Generation 2: a fresh browser with no leftover contexts or seeded state.
        const second = await engineFor(engine).connect(`${esgWsHost}/ws/playwright/${refreshedSessionId}`);
        try {
          const secondEngineName = second.browserType().name();
          // attachSessionCapabilities registers only one session per test, so a second call after
          // refresh is redundant here; kept for reference should the agent gain multi-session support.
          // currentTest.attachSessionCapabilities(
          //   reportingCapabilities(secondEngineName, second.version()),
          //   refreshedSessionId,
          // );

          expect(second.contexts().length, 'refreshed browser still had contexts').toBe(0);

          const context = await second.newContext({ viewport: viewportFor(secondEngineName) });
          try {
            const cookies = await context.cookies(ORIGIN);
            expect(cookies.some((c) => c.name === MARKER_KEY), 'seeded cookie survived refresh').toBe(false);

            const page = await context.newPage();
            await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
            expect(
              await page.evaluate((key) => localStorage.getItem(key), MARKER_KEY),
              'seeded localStorage survived refresh',
            ).toBeNull();
          } finally {
            await context.close();
          }
        } finally {
          await second.close();
        }
      } finally {
        await deleteEsgSession(originalSessionId);
      }
    });
  });
}
