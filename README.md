# Playwright on ESG

This project runs Playwright tests against ESG, the Zebrunner Elastic Selenium Grid. Each test
starts a remote browser on ESG and connects to it over the native Playwright WebSocket. The
tests do not start a local browser; `connect()` attaches to the remote browser server.

For the full detail — endpoints, configuration reference, test files, parallelism, and
troubleshooting — read the [Testing Guide](docs/testing-guide.md).

## Requirements

- Node.js 18 or later (global `fetch` and `AbortSignal.timeout`).
- Network access to an ESG host, and ESG credentials.

## Install

```bash
npm install
```

## Configure

Copy the template and set the host and credentials:

```bash
cp .env.example .env
```

Set one of:

- `ESG_HOST`, `ESG_USER`, and `ESG_PASSWORD`, or
- `ZEBRUNNER_HUB_URL` with the credentials in the URL.

An absent host or credential fails the test early with a clear message. See the
[configuration reference](docs/testing-guide.md#configuration-reference) for every variable.

## Run the tests

| Command | Runs |
| --- | --- |
| `npm test` | All specs |
| `npm run test:fileserver-clipboard` | Download endpoint, clipboard endpoint, and both after refresh |
| `npm run test:refresh-isolation` | Clean download path and isolated browser after refresh |
| `npm run test:refresh:parallel` | Parallel refresh sessions |
| `npm run typecheck` | Type check only, no browser or ESG needed |

Run one file:

```bash
npx playwright test playwright-on-esg.spec.ts
```

Run the data-driven suites across engines:

```bash
ESG_PLAYWRIGHT_BROWSERS=chromium,firefox,webkit npm run test:refresh-isolation
```

## Endpoints

Each session exposes these ESG endpoints (all need only the session ID):

- WebSocket connect — `wss://<host>/ws/playwright/<sessionId>`
- Refresh — `POST /playwright/<sessionId>/refresh`
- Download — `GET /download/<sessionId>/?json`, `GET|DELETE /download/<sessionId>/<name>`
- Clipboard — `GET|POST /clipboard/<sessionId>`

See [Endpoints](docs/testing-guide.md#endpoints) for usage, helpers, and examples.
