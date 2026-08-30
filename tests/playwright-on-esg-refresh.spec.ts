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

// One ESG task opened in beforeAll and closed in afterAll. Serial mode reruns the whole
// group on retry, so a retried run opens a fresh session in the new worker.
test.describe.serial('Playwright on ESG shared session', () => {
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
});
