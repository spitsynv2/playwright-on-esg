import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ quiet: true });

const reportingEnabled =
  String(process.env.REPORTING_ENABLED).toLowerCase() === 'true' &&
  Boolean(process.env.REPORTING_SERVER_HOSTNAME && process.env.REPORTING_SERVER_ACCESS_TOKEN);

const workers = Number(process.env.ESG_WORKERS || 1) || 1;
const testTimeoutMs = Number(process.env.ESG_TEST_TIMEOUT_MS || 120_000) || 120_000;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers,
  retries: Number(process.env.ESG_RETRIES || 0) || 0,
  timeout: testTimeoutMs,
  use: {
    video: 'off',
    screenshot: 'off',
    trace: 'off',
  },
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
