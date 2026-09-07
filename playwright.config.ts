import { defineConfig } from '@playwright/test';
import type { RemoteTestOptions } from '@zebrunner/javascript-agent-playwright/remote';
import { config as loadEnv } from 'dotenv';

loadEnv({ quiet: true });

const reportingEnabled =
  String(process.env.REPORTING_ENABLED).toLowerCase() === 'true' &&
  Boolean(process.env.REPORTING_SERVER_HOSTNAME && process.env.REPORTING_SERVER_ACCESS_TOKEN);

const workers = Number(process.env.WORKERS || 1) || 1;
const testTimeoutMs = Number(process.env.TEST_TIMEOUT_MS || 120_000) || 120_000;

export default defineConfig<RemoteTestOptions>({
  testDir: './tests',
  fullyParallel: true,
  workers,
  retries: Number(process.env.RETRIES || 0) || 0,
  timeout: testTimeoutMs,
  use: {
    // Refresh and the default engine come from env (REMOTE_REFRESH, REMOTE_PLAYWRIGHT_BROWSER_NAME).
    // ESG sessions run headed so VNC and video show a real screen.
    headless: false,
    video: 'off',
    screenshot: 'off',
    trace: 'off',
  },
  projects: [
    // Per-test mode: one session per test, deleted at the end.
    { name: 'esg', testMatch: /(playwright-on-esg|fileserver-clipboard)\.spec\.ts$/ },
    // Refresh mode: one session per worker, refreshed between tests.
    {
      name: 'refresh',
      testMatch: /-(refresh|parallel-refresh|refresh-isolation)\.spec\.ts$/,
      use: { remoteOptions: { refresh: true } },
    },
    // The device suite pins a fixed engine per test with session capabilities.
    {
      name: 'device-webkit',
      testMatch: /device\.spec\.ts$/,
      grep: /iPhone/,
      use: { remoteOptions: { capabilities: { browserName: 'webkit' } } },
    },
    {
      name: 'device-chromium',
      testMatch: /device\.spec\.ts$/,
      grep: /Android/,
      use: { remoteOptions: { capabilities: { browserName: 'chromium' } } },
    },
  ],
  reporter: [
    ['list'],
    [
      '@zebrunner/javascript-agent-playwright',
      {
        enabled: reportingEnabled,
        projectKey: process.env.REPORTING_PROJECT_KEY ?? 'DEF',
        server: {
          hostname: process.env.REPORTING_SERVER_HOSTNAME,
          accessToken: process.env.REPORTING_SERVER_ACCESS_TOKEN,
        },
        launch: {
          displayName: process.env.REPORTING_LAUNCH_DISPLAY_NAME ?? 'Playwright on ESG',
          build: process.env.REPORTING_LAUNCH_BUILD ?? '1.0.0',
          environment: process.env.REPORTING_LAUNCH_ENVIRONMENT ?? 'grid',
        },
        logs: {
          flushIntervalMs: process.env.REPORTING_LOGS_FLUSH_INTERVAL_MS ?? 1000,
        },
      },
    ],
  ],
});
