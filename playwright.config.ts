import { defineConfig } from '@playwright/test';
import type { SessionTestOptions } from '@zebrunner/javascript-agent-playwright/session-fixture';
import { config as loadEnv } from 'dotenv';

loadEnv({ quiet: true });

const reportingEnabled =
  String(process.env.REPORTING_ENABLED).toLowerCase() === 'true' &&
  Boolean(process.env.REPORTING_SERVER_HOSTNAME && process.env.REPORTING_SERVER_ACCESS_TOKEN);

const workers = Number(process.env.WORKERS || 1) || 1;
const testTimeoutMs = Number(process.env.TEST_TIMEOUT_MS || 120_000) || 120_000;

// Headed by default so the grid VNC and video show a real screen. Set
// HEADLESS=true for a local / container run (REMOTE_SESSION_ENABLED=false) that has no display,
// or a headed browser stops with "Missing X server or $DISPLAY".
const headless = String(process.env.HEADLESS).toLowerCase() === 'true';

export default defineConfig<SessionTestOptions>({
  testDir: './tests',
  fullyParallel: true,
  workers,
  retries: Number(process.env.RETRIES || 0) || 0,
  timeout: testTimeoutMs,
  use: {
    // Refresh and the default engine come from env (REMOTE_SESSION_REFRESH, SESSION_BROWSER_NAME).
    // Headed on the grid (VNC + video); HEADLESS=true forces headless for a local run.
    headless,
    // On by default. A remote run ignores this (Zebrunner shows the grid's
    // server-side recording); a local run (REMOTE_SESSION_ENABLED=false) records the Playwright
    // video and the agent attaches it.
    video: 'on',
    // On by default. Playwright captures a screenshot at each test end; the agent
    // uploads every 'image/png' attachment to Zebrunner. Works local and remote.
    screenshot: 'on',
    trace: 'off',
  },
  projects: [
    // Per-test mode: one session per test, deleted at the end.
    {
      name: 'esg',
      testMatch: /(playwright-on-esg|fileserver-clipboard|playwright-on-esg-rerun|playwright-on-esg-screenshot|playwright-on-esg-capabilities)\.spec\.ts$/,
    },
    // Refresh mode: one session per worker, refreshed between tests.
    {
      name: 'refresh',
      testMatch: /-(refresh|parallel-refresh|refresh-isolation)\.spec\.ts$/,
      use: { sessionOptions: { refresh: true } },
    },
    // The device suite pins a fixed engine per test with session capabilities.
    {
      name: 'device-webkit',
      testMatch: /device\.spec\.ts$/,
      grep: /iPhone/,
      use: { sessionOptions: { capabilities: { browserName: 'webkit' } } },
    },
    {
      name: 'device-chromium',
      testMatch: /device\.spec\.ts$/,
      grep: /Android/,
      use: { sessionOptions: { capabilities: { browserName: 'chromium' } } },
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
          flushIntervalMillis: process.env.REPORTING_LOGS_FLUSH_INTERVAL_MILLIS ?? 1000,
        },
      },
    ],
  ],
});
