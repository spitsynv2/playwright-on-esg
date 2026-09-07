import { test } from '@zebrunner/javascript-agent-playwright/remote';

import { runPlaywrightScenario } from '../src/scenario';

// Default mode: the fixture creates one ESG session per test and deletes it at the end.
test.describe('Playwright on ESG', () => {
  test('creates a session, navigates Playwright, then deletes it', async ({ page }) => {
    await runPlaywrightScenario(page);
  });

  test('opens a second independent session and navigates again', async ({ page }) => {
    await runPlaywrightScenario(page);
  });
});
