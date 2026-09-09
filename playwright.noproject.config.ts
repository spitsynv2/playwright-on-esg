import { defineConfig } from '@playwright/test';
import type { SessionTestOptions } from '@zebrunner/javascript-agent-playwright/session-fixture';
import { config as loadEnv } from 'dotenv';

loadEnv({ quiet: true });

// A deliberately project-LESS Playwright config used to prove the Zebrunner
// rerun scoping works when Playwright has no `projects` block (default project
// name is the empty string). It mirrors playwright.config.ts but omits
// `projects`, so the reporter emits names without a leading project segment and
// preload.mjs must scope the rerun with a bracket-less --test-list line.

const reportingEnabled =
  String(process.env.REPORTING_ENABLED).toLowerCase() === 'true' &&
  Boolean(process.env.REPORTING_SERVER_HOSTNAME && process.env.REPORTING_SERVER_ACCESS_TOKEN);

const workers = Number(process.env.WORKERS || 1) || 1;
const testTimeoutMs = Number(process.env.TEST_TIMEOUT_MS || 120_000) || 120_000;

// Headed by default (VNC on the remote grid, like the main config). Set
// HEADLESS=true to run headless — needed for a local / container run
// (REMOTE_SESSION_ENABLED=false) that has no X server, otherwise a headed browser crashes with
// "Missing X server or $DISPLAY".
const headless = String(process.env.HEADLESS).toLowerCase() === 'true';

export default defineConfig<SessionTestOptions>({
  testDir: './tests',
  testMatch: /playwright-on-esg-noproject-rerun\.spec\.ts$/,
  fullyParallel: true,
  workers,
  retries: Number(process.env.RETRIES || 0) || 0,
  timeout: testTimeoutMs,
  // No `projects` block on purpose: the default project name is '' here.
  use: {
    headless,
    video: 'on',
    // On by default. Playwright captures a screenshot at each test end; the agent
    // uploads it to Zebrunner. Works local and remote.
    screenshot: 'on',
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
          displayName: process.env.REPORTING_LAUNCH_DISPLAY_NAME ?? 'Playwright on ESG (no project)',
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
