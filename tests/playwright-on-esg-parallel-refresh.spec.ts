import { expect, test } from '@playwright/test';

import {
  browserName,
  createEsgSession,
  createTimeoutMs,
  deleteEsgSession,
  refreshBrowserName,
  refreshEsgSession,
  refreshTimeoutMs,
  requireEsgCredentials,
  runPlaywrightFlow,
} from '../src/playwright-esg';

// Each call adds one serial group. A serial group is one parallel unit, so two groups
// run on two workers at the same time, each with its own ESG task and refresh.
function defineSharedRefreshGroup(title: string) {
  test.describe.serial(title, () => {
    let originalSessionId = '';
    let sessionId = '';
    let currentBrowserType = browserName;

    test.beforeAll(async () => {
      // The hook has its own timeout; the create fetch can outlast the default, so raise it here.
      test.setTimeout(createTimeoutMs + 120_000);
      requireEsgCredentials();
      originalSessionId = await createEsgSession();
      sessionId = originalSessionId;
    });

    test.afterAll(async () => {
      if (originalSessionId) {
        await deleteEsgSession(originalSessionId);
      }
    });

    test('runs the flow on the created session', async () => {
      test.setTimeout(createTimeoutMs + 120_000);
      expect(sessionId, 'session was not created in beforeAll').toBeTruthy();

      // The swap closes the browser server, so disconnect before the next test refreshes.
      await runPlaywrightFlow(currentBrowserType, sessionId);
    });

    test('refreshes the browser, then runs the same flow on the new session', async () => {
      test.setTimeout(refreshTimeoutMs + 180_000);
      expect(sessionId, 'previous test did not leave a session').toBeTruthy();

      const refreshed = await refreshEsgSession(sessionId, refreshBrowserName);
      const newSessionId = refreshed.sessionId || '';
      expect(newSessionId).not.toBe(sessionId);
      expect(refreshed.originalSessionId).toBe(originalSessionId);
      expect(refreshed.generation).toBe(2);

      sessionId = newSessionId;
      currentBrowserType = refreshed.browserType || refreshBrowserName;
      await runPlaywrightFlow(currentBrowserType, sessionId);
    });

    test('refreshes the browser, then runs the same flow on the new session third time', async () => {
      test.setTimeout(refreshTimeoutMs + 180_000);
      expect(sessionId, 'previous test did not leave a session').toBeTruthy();

      const refreshed = await refreshEsgSession(sessionId, refreshBrowserName);
      const newSessionId = refreshed.sessionId || '';
      expect(newSessionId).not.toBe(sessionId);
      expect(refreshed.originalSessionId).toBe(originalSessionId);
      expect(refreshed.generation).toBe(3);

      sessionId = newSessionId;
      currentBrowserType = refreshed.browserType || refreshBrowserName;
      await runPlaywrightFlow(currentBrowserType, sessionId);
    });
  });
}

defineSharedRefreshGroup('Playwright on ESG shared session A');
defineSharedRefreshGroup('Playwright on ESG shared session B');
defineSharedRefreshGroup('Playwright on ESG shared session C');
defineSharedRefreshGroup('Playwright on ESG shared session D');
defineSharedRefreshGroup('Playwright on ESG shared session E');
defineSharedRefreshGroup('Playwright on ESG shared session F');
defineSharedRefreshGroup('Playwright on ESG shared session G');
defineSharedRefreshGroup('Playwright on ESG shared session H');
