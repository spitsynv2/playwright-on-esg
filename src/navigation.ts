import type { Page } from '@playwright/test';

export async function openPage(page: Page, url: string, options?: Parameters<Page['goto']>[1]): Promise<void> {
  await page.goto(url, options);
  // Pause after navigation so these fast tests stay visible for manual checks.
  await page.waitForTimeout(5_000);
}
