import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { RemoteSession } from '@zebrunner/javascript-agent-playwright/remote';

import { downloadFilename, downloadInPage, downloadText } from './scenario';

export const CLIPBOARD_TEXT = 'Zebrunner clipboard round-trip 42';

// xseld comes up once the X server is ready, so retry the round-trip against the session.
export async function verifyClipboard(remoteSession: RemoteSession, text: string): Promise<void> {
  await expect(async () => {
    await remoteSession.setClipboard(text);
    expect(await remoteSession.getClipboard()).toBe(text);
  }).toPass({ timeout: 30_000, intervals: [1000, 2000, 3000] });
}

// Downloads a file in the page, verifies the fileserver serves it, attaches it, then removes it.
export async function verifyDownload(page: Page, remoteSession: RemoteSession): Promise<void> {
  const download = await downloadInPage(page, downloadText, downloadFilename);
  // failure() resolves once the download finishes writing; null means success.
  expect(await download.failure(), 'browser download failed').toBeNull();

  const files = await remoteSession.listDownloads();
  expect(files.length, 'fileserver listed no downloads').toBeGreaterThan(0);

  const name = files[0];
  const response = await remoteSession.fetchDownload(name);
  expect(response.status, `GET download ${name}`).toBe(200);
  const body = await response.text();
  expect(body).toContain(downloadText);

  // Attach the file retrieved through the fileserver to the Zebrunner test report.
  await test.info().attach(download.suggestedFilename(), { body: Buffer.from(body, 'utf8') });

  await remoteSession.deleteDownload(name);
  expect(await remoteSession.listDownloads()).not.toContain(name);
}
