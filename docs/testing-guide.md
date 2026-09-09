# Playwright on ESG — Testing Guide

This guide explains how the tests work, how to write new tests, how to use the `remoteSession`
endpoints, and the full configuration reference. For install and a quick start, read the
[README](../README.md).

The tests import `test` from `@zebrunner/javascript-agent-playwright/remote`. The remote fixture
owns the ESG session. The tests use the standard `page` and `context` fixtures, and use
`remoteSession` for the remote-only endpoints.

## How it works

### The fixture

The remote fixture does four things:

- It selects local or remote from the environment. See `useRemoteBrowser`.
- It creates the ESG session, connects Playwright over the WebSocket, and deletes the session.
- It refreshes the browser between tests when refresh mode is on. See `useSessionRefresh`.
- It exposes `page`, `context`, `remoteBrowser`, and `remoteSession` to the tests.

A test uses `page` and `context` for normal browser work. A test uses `remoteSession` for the
control-plane endpoints (clipboard and downloads) and for the session identifiers.

### Session model

One session has four steps:

1. The fixture sends `POST /session` with the capabilities. The create request needs basic authentication.
2. ESG returns a top-level `sessionId`, for example `{"sessionId": "<uuid>"}`.
3. Playwright connects to `wss://<host>/ws/playwright/<sessionId>`.
4. The fixture sends `DELETE /session/<originalSessionId>` to end the session.

### Session modes

The project selects the mode. See the `esg` and `refresh` projects in the "Projects and engines"
section. `remoteOptions.refresh` on a project turns refresh on. `REMOTE_SESSION_REFRESH=true` forces
refresh for any run.

- Per-test (the `esg` project) — The fixture creates one session for each test and deletes it at
  the end.
- Refresh (the `refresh` project) — The fixture creates one session for each worker. The fixture
  refreshes the browser between tests, and deletes the session when the worker stops.

A refresh needs a shared session across tests, so refresh scenarios use `test.describe.serial`.
A serial group runs on one worker, so the tests in the group share the session.

### Refresh model

The refresh request replaces the browser inside the same session. The session and its artifacts stay.
`POST /playwright/<sessionId>/refresh` has no authentication middleware. The session ID is the
credential.

The response has this form:

```json
{
  "value": {
    "sessionId": "<new-id>",
    "originalSessionId": "<root-id>",
    "browserType": "playwright-chromium",
    "generation": 2
  }
}
```

- `sessionId` — The ID of the new browser. The fixture uses this ID for the WebSocket reconnect.
- `originalSessionId` — The root session ID.
- `generation` — The count of browsers the session started.

After the refresh, the fixture reconnects Playwright to `wss://<host>/ws/playwright/<new-id>`.

### Original ID and child ID

A refresh creates a child session ID. The original ID and every child ID resolve to the same
session. This behavior gives two options:

- The next refresh accepts the original ID or the latest child ID. Both reach the same session.
- The delete accepts the original ID or any child ID. A delete stops the complete session.

The fixture keeps `originalSessionId` and uses it for the delete.

After a delete, each ID of that session returns `409 session stopped` for 10 minutes. After
10 minutes, each ID returns `404 invalid session id`.

## The remoteSession API

`remoteSession` is a `RemoteSession`. It is remote-only, so it throws during a local run. Use it
for the identifiers and the control-plane endpoints.

Identifiers:

- `remoteSession.sessionId` — The current browser ID.
- `remoteSession.originalSessionId` — The root session ID.
- `remoteSession.generation` — The browser generation count. It increases after each refresh.
- `remoteSession.browserName` — The engine of the current browser.

Endpoints:

- `remoteSession.setClipboard(text)` / `remoteSession.getClipboard()`
- `remoteSession.listDownloads()` / `remoteSession.fetchDownload(name)` / `remoteSession.deleteDownload(name)`
- `remoteSession.downloadUrl(name?)` — The URL of the download endpoint.

The `page`, `context`, and `remoteBrowser` fixtures are the standard Playwright objects on the
remote browser. Use `remoteBrowser.newContext(...)` for device emulation or a clean context.

## Endpoints

All endpoints below are relative to the remote host. The session-scoped endpoints need only the
session ID, not basic authentication. The fixture wraps these endpoints, so a test calls the
`remoteSession` methods and does not call the endpoints directly.

### WebSocket connect

```
wss://<host>/ws/playwright/<sessionId>
```

The fixture connects Playwright to this URL and reconnects to the new ID after a refresh.

### Refresh

```
POST /playwright/<sessionId>/refresh
Content-Type: application/json

{ "browserName": "chromium" }
```

The fixture sends the refresh in refresh mode and validates the response.

### Download (fileserver)

The remote session serves the browser download directory under the session:

- List file names (newest first):

  ```
  GET /download/<sessionId>/?json
  ```

  The response is a JSON array of file names.

- Fetch one file:

  ```
  GET /download/<sessionId>/<name>
  ```

- Delete one file:

  ```
  DELETE /download/<sessionId>/<name>
  ```

`remoteSession.listDownloads()`, `remoteSession.fetchDownload(name)`, and
`remoteSession.deleteDownload(name)` wrap these routes.

Rules:

- Playwright stores downloads under GUID file names, not the suggested name. List the files
  first, then fetch by the returned name.
- The browser removes its downloads when the context or the browser closes. Query the file
  server while the browser is still open.
- A refresh starts a new browser generation with an empty download directory.

Example:

```ts
const download = await downloadInPage(page, downloadText, downloadFilename);
expect(await download.failure()).toBeNull();

const names = await remoteSession.listDownloads();
const response = await remoteSession.fetchDownload(names[0]);
const body = await response.text();
expect(body).toContain(downloadText);

// Optional: attach the file to the Zebrunner report.
await test.info().attach(download.suggestedFilename(), { body: Buffer.from(body, 'utf8') });

await remoteSession.deleteDownload(names[0]);
```

### Clipboard

The remote session exposes a clipboard service under the session:

- Set the clipboard:

  ```
  POST /clipboard/<sessionId>
  Content-Type: text/plain

  <text>
  ```

- Read the clipboard:

  ```
  GET /clipboard/<sessionId>
  ```

`remoteSession.setClipboard(text)` and `remoteSession.getClipboard()` wrap these routes.

The clipboard service starts after the X server is ready, so retry the round-trip for a fresh
session. The tests use `expect(...).toPass(...)`.

## Configuration reference

The project reads configuration from environment variables. Playwright loads a `.env` file
through `dotenv`. Copy `.env.example` to `.env` to start.

### Connection

- `REMOTE_HOST_URL` — The host with the credentials in the URL, for example
  `https://user:password@engine.zebrunner.dev`.
- `ZEBRUNNER_HUB_URL` — The host with the credentials in the URL. A Zebrunner launch sets this
  value. It wins when both hosts are set.
- `ZEBRUNNER_CAPABILITIES` — The launch capabilities as JSON. A Zebrunner launch sets this value.
  The fixture merges these capabilities into the create request.
- `REMOTE_SESSION_ENABLED` — Forces the choice. `REMOTE_SESSION_ENABLED=true` is remote. `REMOTE_SESSION_ENABLED=false` is local. When `REMOTE_SESSION_ENABLED`
  is not set, the fixture runs remote if `REMOTE_HOST_URL` or `ZEBRUNNER_HUB_URL` is set.

An absent host or credential fails the test early with a clear message.

### Session mode

- `REMOTE_SESSION_REFRESH` — A boolean. `true` selects refresh mode. Default: `false`.

### Browser

- `SESSION_BROWSER_NAME` — The default engine for a local or a remote run. Values: `chromium`,
  `chrome`, `edge`, `firefox`, `webkit`, or `safari`. Default: `chromium`. The device projects set
  the engine per test with capabilities, so this value does not apply to the device spec.
- `HEADLESS` — A boolean that sets the Playwright `headless` option. Default: `false`. The config runs headed by default.
- `REMOTE_SESSION_PLAYWRIGHT_VERSION` — The Playwright version, for example `1.58.2`. Default: the
  installed `@playwright/test` version.

### Download tests

- `DOWNLOAD_TEXT` — The download payload. Default: a fixed string.
- `DOWNLOAD_FILENAME` — The suggested file name. Default: `hello.txt`.
- `STEP_PAUSE_MS` — A pause after each navigation in the scenario. Default: `0`.

### Zebrunner session capabilities

The project sends these values in `zebrunner:options`.

- `REMOTE_SESSION_BROWSER_CPU` — Session CPU units. Playwright uses a minimum of 1024.
- `REMOTE_SESSION_BROWSER_MEMORY` — Session memory in MB. Playwright uses a minimum of 2048.
- `REMOTE_SESSION_BROWSER_ENABLE_VIDEO` — Video record. Default: `true`.
- `REMOTE_SESSION_BROWSER_ENABLE_VNC` — Live VNC. Default: `true`.
- `REMOTE_SESSION_BROWSER_ENABLE_LOG` — Default: `true`.
- `REMOTE_SESSION_BROWSER_ENABLE_DEBUG` — Default: `false`.
- `REMOTE_SESSION_IDLE_TIMEOUT` — Seconds. Default: `300`. A larger value is reduced to the platform maximum.
- `REMOTE_SESSION_MAX_TIMEOUT` — Seconds. The hard limit on session life.
- `REMOTE_SESSION_BROWSER_SCREEN_RESOLUTION` — Format `WxHxD`. Default: `1920x1080x24`.
- `REMOTE_SESSION_BROWSER_VIDEO_SCREEN_SIZE` — Default: the screen resolution.
- `REMOTE_SESSION_BROWSER_FRAME_RATE` — Default: `12`.
- `REMOTE_SESSION_BROWSER_TIME_ZONE` — An IANA name, for example `Europe/Kyiv`.

### Timeouts

- `TEST_TIMEOUT_MS` — The Playwright test timeout. Default: `120000`.
- `REMOTE_SESSION_CREATE_TIMEOUT_MS` — The timeout for the create request. Default: `600000`.
- `REMOTE_SESSION_CONNECT_TIMEOUT_MS` — The timeout for the WebSocket connect. Default: `120000`.
- `REMOTE_SESSION_REFRESH_TIMEOUT_MS` — The timeout for the refresh request. Default: `150000`.
- `REMOTE_SESSION_DELETE_TIMEOUT_MS` — The timeout for the delete request. Default: `30000`.

### Runner

- `WORKERS` — The parallel worker count. Default: `1`.
- `RETRIES` — The retry count. Default: `0`.

### Zebrunner reporting (optional)

The `@zebrunner/javascript-agent-playwright` reporter sends results to Zebrunner. The reporter is
active only when `REPORTING_ENABLED` is `true` and both server values exist.

- `REPORTING_ENABLED` — `true` or `false`.
- `REPORTING_SERVER_HOSTNAME` — The Zebrunner host.
- `REPORTING_SERVER_ACCESS_TOKEN` — The Zebrunner access token.
- `REPORTING_PROJECT_KEY` — The project key. Default: `DEF`.
- `REPORTING_LAUNCH_DISPLAY_NAME`, `REPORTING_LAUNCH_BUILD`, and `REPORTING_LAUNCH_ENVIRONMENT`
  — The launch metadata.

## Projects and engines

`playwright.config.ts` defines four projects:

- `esg` — The default spec and the fileserver-clipboard spec, in per-test mode. The engine comes
  from `SESSION_BROWSER_NAME`.
- `refresh` — The refresh, parallel-refresh, refresh-isolation, and fileserver-clipboard-refresh
  specs. It sets `remoteOptions.refresh` to `true`, so the fixture runs refresh mode without an
  env var. The engine comes from `SESSION_BROWSER_NAME`.
- `device-webkit` — The device spec, filtered to the iPhone test with `grep`. It pins the session
  engine to `webkit` with `remoteOptions.capabilities.browserName`.
- `device-chromium` — The device spec, filtered to the Android test with `grep`. It pins the
  session engine to `chromium`.

Each spec belongs to one project, so a bare file path runs under the correct project:

```bash
# Runs under the refresh project, so refresh mode is on
npx playwright test playwright-on-esg-refresh.spec.ts
```

The two device projects let both device tests run in one command, each on the correct engine:

```bash
npx playwright test playwright-on-esg-device.spec.ts
```

## Device emulation

The device tests emulate a phone with a Playwright device descriptor from `devices`.

- The ESG session engine must match the descriptor engine. An iPhone descriptor needs WebKit.
  A Pixel descriptor needs Chromium. The device projects pin the engine per test.
- Device emulation needs the mobile flag. Only Chromium and WebKit support it, so the device
  tests do not use Firefox.
- WebKit on Linux reports `navigator.maxTouchPoints` as `0`, even with touch emulation. The test
  asserts touch with a combined signal, not `maxTouchPoints`.
- The test applies the descriptor with `remoteBrowser.newContext({ ...device })`. Do not set a
  separate viewport for the device flow.

## Parallelism and the refresh

A refresh needs a shared session across tests, so refresh scenarios use `test.describe.serial`.

Playwright gives work to a worker in units:

- `fullyParallel: true` makes each test a unit. This project uses this mode.
- `test.describe.serial(...)` makes the whole group one unit on one worker.

The worker count acts by this formula:

```
workers used = min(workers, number of independent units)
```

- To run refresh scenarios in parallel, add one serial group for each parallel session, then set
  `WORKERS` to the group count.
- Each busy worker holds one live remote session. Keep the worker count inside your grid concurrency
  limit and account quota.

## Test files

- `tests/playwright-on-esg.spec.ts` — The standard path. One test opens a session, runs the
  scenario, then deletes the session.
- `tests/playwright-on-esg-device.spec.ts` — Phone emulation. One test for an iPhone on WebKit
  and one test for an Android phone on Chromium. The device projects run both.
- `tests/playwright-on-esg-refresh.spec.ts` — One shared session across two serial tests. The
  first runs the scenario. The second refreshes, then runs the scenario on the new browser. It
  runs under the `refresh` project.
- `tests/playwright-on-esg-parallel-refresh.spec.ts` — Eight serial groups that run the refresh
  scenario in parallel. Run with `npm run test:refresh:parallel`.
- `tests/playwright-on-esg-fileserver-clipboard.spec.ts` — The download endpoint and the
  clipboard endpoint, in per-test mode.
- `tests/playwright-on-esg-fileserver-clipboard-refresh.spec.ts` — The same two endpoints across
  a refresh, in refresh mode. `npm run test:fileserver-clipboard` runs both files.
- `tests/playwright-on-esg-refresh-isolation.spec.ts` — The isolation check. It proves the
  refresh clears the download path and returns a clean, isolated browser with no leftover
  contexts, cookies, or `localStorage`. Run with `npm run test:refresh-isolation`.

## Shared code

`src/scenario.ts` holds the shared helpers.

- `runPlaywrightScenario(page)` — Navigates the Playwright site and runs a short scenario.
- `downloadInPage(page, text, filename)` — Triggers a download in the page with a Blob URL. A
  Blob URL works on Chromium, Firefox, and WebKit. A data URL does not.
- `downloadText` and `downloadFilename` — The download payload data, from the environment.

`src/fileserver.ts` holds the fileserver and clipboard assertions.

- `verifyDownload(page, remoteSession)` — Downloads a file, fetches it through the fileserver,
  attaches it to the report, then deletes it.
- `verifyClipboard(remoteSession, text)` — Sets and reads the clipboard, and retries the round-trip.

## Troubleshooting

- `returned non-JSON` — ESG returned an HTML page. The common cause is a wrong credential. Check
  the user and password in `REMOTE_HOST_URL` or `ZEBRUNNER_HUB_URL`.
- `failed (<status>)` with an ESG message — ESG returned `{"value": {"error": "...", "message": "..."}}`.
  Read the ESG text for the cause.
- `Missing remote credentials` — The host URL has no user or password. Put the credentials in the URL.
- `The remote browser is not connected` — The test used `remoteSession.browser` before the
  connect, or after a failure. Check the session state.
- A version warning on connect — The client and the remote browser run different Playwright
  versions. Match the versions and start a new session.
- `maxTouchPoints` is 0 on WebKit — This is normal on WebKit on Linux. Do not assert it.
- Firefox shows "The security sandbox is disabled" — This is expected on the remote browser.

## Playwright version match

The client and the remote browser must run the same Playwright version. The client is the
`@playwright/test` package.

- Keep the same `major.minor` at a minimum, and the same exact version when you can.
- Pin exact versions on both sides.
- After a version bump, use a matching remote browser version, then start a new session.
