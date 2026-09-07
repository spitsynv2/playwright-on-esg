import { expect } from '@playwright/test';
import type { Download, Page } from '@playwright/test';

const stepPauseMs = Number(process.env.STEP_PAUSE_MS || 0) || 0;

// Data for the download tests, overridable from the environment.
export const downloadText = process.env.DOWNLOAD_TEXT || 'Zebrunner fileserver download payload';
export const downloadFilename = process.env.DOWNLOAD_FILENAME || 'hello.txt';

export async function runPlaywrightScenario(page: Page): Promise<void> {
  // Navigation 1: the home page.
  await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
  await expect(page).toHaveTitle(/Playwright/);
  await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible();
  await page.waitForTimeout(stepPauseMs);

  // Navigation 2: click into the docs.
  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page).toHaveURL(/\/docs\/intro/);
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
  await page.waitForTimeout(stepPauseMs);

  // Write: open the search dialog and type a query.
  await page.getByRole('button', { name: /Search/ }).first().click();
  const searchInput = page.getByPlaceholder('Search docs');
  await searchInput.fill('locators');
  await expect(searchInput).toHaveValue('locators');
  await page.waitForTimeout(stepPauseMs);
  await page.keyboard.press('Escape');

  // Navigation 3: follow a sidebar link.
  await page.getByRole('link', { name: 'Writing tests', exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/writing-tests/);
  await expect(page.getByRole('heading', { name: 'Writing tests' })).toBeVisible();
  await page.waitForTimeout(stepPauseMs);
}

// A Blob URL triggers a download across chromium, firefox, and webkit; a data URL does not.
export async function downloadInPage(page: Page, text: string, filename: string): Promise<Download> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(
      ({ text, filename }) => {
        const anchor = document.createElement('a');
        anchor.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
      },
      { text, filename },
    ),
  ]);
  return download;
}
