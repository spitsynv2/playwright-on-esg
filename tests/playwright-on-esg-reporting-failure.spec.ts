import { setTimeout } from 'node:timers/promises';
import { expect } from '@playwright/test';
import { currentTest } from '@zebrunner/javascript-agent-playwright';
import { test } from '@zebrunner/javascript-agent-playwright/session-fixture';

test.beforeEach(async () => {
  await setTimeout(5_000);
});

// Failure reporting suite. These tests fail on purpose, so they live in their
// own project (`reporting-failure`) and are never part of a green run. Run them
// when you need to check how the agent reports a failure:
//
//   npm run test:reporting-failure
//
// Zebrunner, after the run:
//   - the launch result is FAILED
//   - "reports an assertion failure" is FAILED and its failure reason holds the
//     expect() diff and the source location
//   - "reports a retried failure" is one test record with `retries` = 1, not two
//     records, and its artifacts are prefixed by attempt where they collide
//   - logs and labels attached before the failure are still reported
test.describe('Zebrunner failure reporting', () => {
  test('reports an assertion failure', async ({ page }) => {
    currentTest.attachLabel('expected-result', 'failed');
    currentTest.log.info('Navigating before the deliberate failure');

    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });

    // The agent must report this diff as the failure reason.
    await expect(page, 'deliberate failure: the title is "Playwright"').toHaveTitle(/NotThePlaywrightTitle/, {
      timeout: 5_000,
    });
  });

  test('reports a retried failure as one test with a retry count', async ({ page }, testInfo) => {
    // Needs retries on the run, for example: npm run test:reporting-failure -- --retries=1
    currentTest.log.warn(`Attempt ${testInfo.retry + 1} (retry index ${testInfo.retry})`);
    currentTest.attachLabel('expected-result', 'failed');

    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
    currentTest.attachScreenshot(await page.screenshot());

    await expect(
      page.getByRole('link', { name: 'Get started - does not exist' }),
      'deliberate failure: this link is not on the page',
    ).toBeVisible({ timeout: 5_000 });
  });
});
