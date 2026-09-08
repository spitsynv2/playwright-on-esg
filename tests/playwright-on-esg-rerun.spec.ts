import { test } from '@zebrunner/javascript-agent-playwright/remote';
import { expect } from '@playwright/test';

// Smoke suite for Zebrunner reporting + rerun.
//
// One test always passes and one test always fails, so a single launch
// produces a mixed result (1 passed, 1 failed). After you relaunch only the
// failed test from Zebrunner, the agent's rerun mechanism (preload.mjs scopes
// the run via the Playwright --test-list, and the reporter restarts the
// original Zebrunner test id) must re-run only the failing test.
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
