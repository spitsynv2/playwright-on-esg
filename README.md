# Playwright on ESG

This project runs Playwright tests on ESG, the Zebrunner Elastic Selenium Grid. The tests import
`test` from the Zebrunner remote fixture, so the standard `page` fixture runs on a remote ESG
browser. The fixture owns the session lifecycle: create, connect, refresh, and delete. The tests
do not manage sessions.

```ts
import { test } from '@zebrunner/javascript-agent-playwright/session-fixture';

test('runs on ESG', async ({ page }) => {
  await page.goto('https://playwright.dev/');
});
```

For the architecture, the endpoints, and the full configuration reference, read the
[testing guide](docs/testing-guide.md).

## Requirements

- Node.js 18 or later (global `fetch` and `AbortSignal.timeout`).
- Network access to an ESG host, and ESG credentials.

## Install

```bash
npm install
```

## Configure

Copy the template and set the values:

```bash
cp .env.example .env
```

The fixture selects local or remote from the environment:

- `REMOTE_SESSION_ENABLED=true` forces remote. `REMOTE_SESSION_ENABLED=false` forces local.
- When `REMOTE_SESSION_ENABLED` is not set, the fixture runs remote if `REMOTE_HOST_URL` or `ZEBRUNNER_HUB_URL` is set.

To run on ESG from your machine, set one host with the credentials in the URL:

```bash
# .env
REMOTE_HOST_URL=https://user:password@engine.zebrunner.dev
```

A Zebrunner launch sets `ZEBRUNNER_HUB_URL` and `ZEBRUNNER_CAPABILITIES` for you. The
[testing guide](docs/testing-guide.md) covers local runs and every variable.

## Run the tests

The session mode comes from the project. The `esg` project runs one session per test. The
`refresh` project runs one session per worker, refreshed between tests. `npm test` runs every
project.

```bash
# Every project
npm test

# One session per test
npm run test:default

# One session per worker, refreshed between tests
npm run test:refresh
npm run test:refresh:parallel
npm run test:refresh-isolation
npm run test:fileserver-clipboard

# Device emulation: both engines in one run (device-webkit and device-chromium projects)
npm run test:device

# Type check only
npm run typecheck
```

A bare file path runs under its project, so `npx playwright test <file>` picks the correct mode.
`REMOTE_SESSION_REFRESH=true` still forces refresh for any run. The refresh isolation suite runs on one
engine per run. Select the engine with `SESSION_BROWSER_NAME=firefox` (or `webkit`).

See the [testing guide](docs/testing-guide.md) for the session model, the `remoteSession`
endpoints, device emulation, and troubleshooting.
