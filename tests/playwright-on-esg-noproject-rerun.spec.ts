import { test } from '@zebrunner/javascript-agent-playwright/remote';
import { expect } from '@playwright/test';

// No-project variant of the Zebrunner reporting + rerun smoke suite.
//
// This spec is run through playwright.noproject.config.ts, which has NO
// `projects` block. Playwright's default project name is then the empty
// string, so the reporter's test name has no leading project segment
// (`file > describe > title`). This is the case the previous rerun code got
// wrong ("No tests found"): preload.mjs must emit a bracket-less --test-list
// line and Playwright must still match it.
//
// One test always passes and one always fails, so a single launch is mixed
// (1 passed, 1 failed). Relaunching only the failed test must re-run just
// that one test.
test.describe('Zebrunner reporting and rerun smoke (no project)', () => {
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
