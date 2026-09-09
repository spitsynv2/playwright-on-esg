import { test } from '@zebrunner/javascript-agent-playwright/session-fixture';
import { expect } from '@playwright/test';
import { currentTest } from '@zebrunner/javascript-agent-playwright';

// Screenshot smoke suite. It shows the two screenshot paths the agent reports:
//   1. Config path: `use.screenshot: 'on'` makes Playwright capture a screenshot
//      at the end of each test. The agent uploads every 'image/png' attachment,
//      so the shot reaches Zebrunner with no test code.
//   2. Agent path: `currentTest.attachScreenshot(...)` uploads a screenshot the
//      test captures itself, at any point. It is independent of the config path,
//      so it works even with `use.screenshot: 'off'`.
//
// Both paths work on a local run (REMOTE_SESSION_ENABLED=false) and a remote grid run.
test.describe('Zebrunner screenshot reporting', () => {
  test('config screenshot: Playwright captures it at test end', async ({ page }) => {
    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
    await expect(page).toHaveTitle(/Playwright/);
    // No explicit capture. `use.screenshot: 'on'` attaches the screenshot and
    // the agent uploads it.
  });

  test('agent screenshot: attach an explicit shot during the test', async ({ page }) => {
    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
    await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible();
    // Explicit capture + upload through the agent API.
    currentTest.attachScreenshot(await page.screenshot({ fullPage: true }));
  });
});
