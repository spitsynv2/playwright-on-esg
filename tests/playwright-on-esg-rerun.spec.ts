import { test } from '@zebrunner/javascript-agent-playwright/remote';
import { expect } from '@playwright/test';

// Smoke suite for Zebrunner reporting + rerun.
//
// One test always passes and one test always fails, so a single launch
// produces a mixed result (1 passed, 1 failed). After you relaunch only the
// failed test from Zebrunner, the agent's rerun mechanism must re-run only the
// failing test and restart its original Zebrunner test id (not create a
// duplicate record).
//
// The agent scopes the rerun by matching each test's identity
// ({ projectName, spec, titlePath }) and picks its path from the Playwright
// version:
//   - Playwright 1.62+: the reporter's own preprocess() hook scopes the run.
//     No injection is needed; run the plain `npx playwright test ...`.
//   - Playwright 1.58-1.61: preprocess() does not exist, so the run must be
//     preloaded with the agent's preload.mjs, which scopes the rerun via the
//     Playwright --test-list. Inject it with
//     NODE_OPTIONS="--import <agent>/build/javascript-agent-playwright/preload.mjs".
//     The same preload no-ops from 1.62 onward, so leaving it set is harmless.
test.describe('Zebrunner reporting and rerun smoke', () => {
  test('passes: playwright.dev shows the expected title', async ({ page }) => {
    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
    await expect(page).toHaveTitle(/Playwright/);
    await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible();
  });

  test('fails on purpose: asserts a title that never matches', async ({ page }) => {
    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
    // Deliberately wrong: this assertion always fails, which exercises failure
    // reporting and lets you relaunch this single test from Zebrunner.
    await expect(page).toHaveTitle(/This Title Should Never Match/);
  });
});
