import { test } from '@playwright/test';

import {
  browserName,
  createEsgSession,
  createTimeoutMs,
  deleteEsgSession,
  requireEsgCredentials,
  runPlaywrightFlow,
} from '../src/playwright-esg';

async function openNavigateClose() {
  const sessionId = await createEsgSession();
  try {
    await runPlaywrightFlow(browserName, sessionId);
  } finally {
    await deleteEsgSession(sessionId);
  }
}

test.describe('Playwright on ESG', () => {
  test('creates a session, navigates Playwright, then deletes it', async () => {
    test.setTimeout(createTimeoutMs + 120_000);
    requireEsgCredentials();
    await openNavigateClose();
  });

  test('opens a second independent session and navigates again', async () => {
    test.setTimeout(createTimeoutMs + 120_000);
    requireEsgCredentials();
    await openNavigateClose();
  });
});
