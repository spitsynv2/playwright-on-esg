# Playwright on ESG — Testing Guide

This guide explains how the tests work, how to write new tests, how to use the ESG
endpoints (WebSocket, refresh, download, clipboard), and the full configuration reference.
For install and a quick start, read the [README](../README.md).

## How it works

### Session model

ESG starts one ECS task for each session. The task runs three containers: browser,
recorder, and uploader.

One session has four steps:

1. The test sends `POST /session` with the capabilities. The create request needs basic authentication.
2. ESG returns a top-level `sessionId`, for example `{"sessionId": "<uuid>"}`.
3. Playwright connects to `wss://<host>/ws/playwright/<sessionId>`.
4. The test sends `DELETE /session/<sessionId>` to stop the task.

### Refresh model

The refresh request replaces the browser inside the same task. The task and its artifacts
stay. `POST /playwright/<sessionId>/refresh` has no authentication middleware; the session ID
is the credential.

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

- `sessionId` — The ID of the new browser. Use this ID for the WebSocket reconnect.
- `originalSessionId` — The root session that owns the ECS task.
- `generation` — The count of browsers that the task started.

After the refresh, reconnect Playwright to `wss://<host>/ws/playwright/<new-id>`.

### Original ID and child ID

A refresh creates a child session ID. The original ID and every child ID resolve to the same
task. This behavior gives two options:

- Send the next refresh with the original ID or with the latest child ID. Both reach the same task.
- Send the delete with the original ID or with any child ID. A delete stops the complete session.

The tests keep `originalSessionId` and use it for the delete. The latest child ID also works.

After a delete, each ID of that session returns `409 session stopped` for 10 minutes. After
10 minutes, each ID returns `404 invalid session id`.

## Endpoints

All endpoints below are relative to `ESG_HOST`. The WebSocket endpoints use the `ws`/`wss`
scheme. The session-scoped endpoints need only the session ID, not basic authentication.

### WebSocket connect

Connect a Playwright client to the remote browser server:

```
wss://<host>/ws/playwright/<sessionId>
```

The helper `runPlaywrightFlow` connects, sets the viewport per engine, runs a scenario, and
closes the browser.

### Refresh

```
POST /playwright/<sessionId>/refresh
Content-Type: application/json

{ "browserName": "chromium" }
```

Use the helper `refreshEsgSession(sessionId, browserName)`. It validates the response and
returns the new session data.

### Download (fileserver)

The browser image runs a small file server that serves the browser download directory
(`$HOME/Downloads`). ESG proxies it under the session:

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

Helpers in `src/playwright-esg.ts`:

- `downloadInPage(page, text, filename)` — Triggers a download in the page with a Blob URL.
  A Blob URL works on Chromium, Firefox, and WebKit; a data URL does not.
- `listEsgDownloads(sessionId)` — Returns the file name array.
- `fetchEsgDownload(sessionId, name)` — Returns `{ status, body }`.
- `deleteEsgDownload(sessionId, name)` — Deletes one file and returns the status.

Rules:

- Playwright stores downloads under GUID file names, not the suggested name. List the files
  first, then fetch by the returned name.
- The browser removes its downloads when the context or the browser closes. Query the file
  server while the browser is still open.
- A refresh starts a new browser generation with an empty download directory.

Example:

```ts
const download = await downloadInPage(page, 'hello', 'hello.txt');
expect(await download.failure()).toBeNull();

const names = await listEsgDownloads(sessionId);
const file = await fetchEsgDownload(sessionId, names[0]);
expect(file.body).toContain('hello');

// Optional: attach the file to the Zebrunner report.
currentTest.attachArtifact(Buffer.from(file.body, 'utf8'), download.suggestedFilename());

await deleteEsgDownload(sessionId, names[0]);
```

### Clipboard

The browser image runs a clipboard service on the X display. ESG proxies it under the session:

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

Helpers: `setEsgClipboard(sessionId, text)` and `getEsgClipboard(sessionId)`.

The clipboard service starts after the X server is ready, so retry the round-trip for a fresh
session (the tests use `expect(...).toPass(...)`).

## Configuration reference

The project reads configuration from environment variables. Playwright loads a `.env` file
through `dotenv`. Copy `.env.example` to `.env` to start.

### Connection

- `ESG_HOST`, `ESG_USER`, `ESG_PASSWORD` — The host and the credentials.
- `ZEBRUNNER_HUB_URL` — The host with the credentials in the URL. The Zebrunner launcher uses this.

`ESG_HOST` has no default. An absent host or credential fails the test early with a clear message.

### Browser

- `ESG_PLAYWRIGHT_BROWSER_NAME` — The engine. Values: `chromium`, `chrome`, `edge`, `firefox`,
  `webkit`, or `safari`. Default: `chromium`.
- `ESG_PLAYWRIGHT_VERSION` — The Playwright image tag, for example `1.58.2`. Default: the
  installed `@playwright/test` version.
- `ESG_PLAYWRIGHT_HEADLESS` — A boolean. Default: `false`.
- `ESG_PLAYWRIGHT_REFRESH_BROWSER_NAME` — The engine after the refresh. Default: the value of
  `ESG_PLAYWRIGHT_BROWSER_NAME`.

### Download tests (data-driven)

- `ESG_PLAYWRIGHT_BROWSERS` — A comma-separated engine list for the data-driven tests. Default:
  the value of `ESG_PLAYWRIGHT_BROWSER_NAME`.
- `ESG_DOWNLOAD_TEXT` — The download payload. Default: a fixed string.
- `ESG_DOWNLOAD_FILENAME` — The suggested file name. Default: `hello.txt`.

### Zebrunner session capabilities

The project sends these values in `zebrunner:options`.

- `ESG_BROWSER_CPU` — Task CPU units. Playwright uses a minimum of 1024.
- `ESG_BROWSER_MEMORY` — Task memory in MB. Playwright uses a minimum of 2048.
- `ESG_ENABLE_VIDEO` — Video record. Default: `true`.
- `ESG_ENABLE_VNC` — Live VNC. Default: `true`.
- `ESG_ENABLE_LOG` — Default: `true`.
- `ESG_ENABLE_DEBUG` — Default: `false`. A `true` value adds debug text to an error message.
- `ESG_IDLE_TIMEOUT` — Seconds. Default: `300`. ESG reduces a larger value to the cluster maximum.
- `ESG_MAX_TIMEOUT` — Seconds. The hard limit on session life.
- `ESG_SCREEN_RESOLUTION` — Format `WxHxD`. Default: `1920x1080x24`.
- `ESG_VIDEO_SCREEN_SIZE` — Default: the screen resolution.
- `ESG_FRAME_RATE` — Default: `12`.
- `ESG_TIME_ZONE` — An IANA name, for example `Europe/Kyiv`.

The code sends a default for the first six values. The code sends the other values only when set.

### Runner and timeouts

- `ESG_WORKERS` — The parallel worker count. Default: `1`.
- `ESG_RETRIES` — The retry count. Default: `0`.
- `ESG_TEST_TIMEOUT_MS` — The Playwright test timeout. Default: `120000`.
- `ESG_SESSION_CREATE_TIMEOUT_MS` — The timeout for the create request. Default: `600000`.
- `ESG_PLAYWRIGHT_REFRESH_TIMEOUT_MS` — The timeout for the refresh request. Default: `150000`.
- `ESG_STEP_PAUSE_MS` — A pause after each navigation. Default: `5000`.

### Zebrunner reporting (optional)

The `@zebrunner/javascript-agent-playwright` reporter sends results to Zebrunner. The reporter
is active only when `REPORTING_ENABLED` is `true` and both server values exist.

- `REPORTING_ENABLED` — `true` or `false`.
- `REPORTING_SERVER_HOSTNAME` — The Zebrunner host.
- `REPORTING_SERVER_ACCESS_TOKEN` — The Zebrunner access token.
- `REPORTING_PROJECT_KEY` — The project key. Default: `DEF`.
- `REPORTING_LAUNCH_DISPLAY_NAME`, `REPORTING_LAUNCH_BUILD`, and `REPORTING_LAUNCH_ENVIRONMENT`
  — The launch metadata.

## Window size and viewport

`viewportFor` in `src/playwright-esg.ts` chooses the page viewport per engine. The size comes
from `ESG_SCREEN_RESOLUTION`. For example, `1920x1080x24` gives a `1920x1080` viewport.

- Headless, any engine — The code sets the viewport to the screen size.
- Headed Chromium, Chrome, or Edge — The code sets the viewport to `null`. The image sizes the
  window with a launch argument. A client viewport would add browser chrome and clip the top.
- Headed Firefox, WebKit, or Safari — The code sets the viewport to the screen size. These
  engines get no window-size launch argument.

## Device emulation

The device tests emulate a phone with a Playwright device descriptor from `devices`.

- The ESG session engine must match the descriptor engine. An iPhone descriptor needs WebKit.
  A Pixel descriptor needs Chromium. The test reads `device.defaultBrowserType`.
- Device emulation needs the mobile flag. Only Chromium and WebKit support it, so the device
  tests do not use Firefox.
- WebKit on Linux reports `navigator.maxTouchPoints` as `0`, even with touch emulation. The
  test asserts touch with a combined signal, not `maxTouchPoints`.
- The test applies the descriptor with `browser.newContext({ ...device })`. Do not set a
  separate viewport for the device flow.

## Timeout model

Two different timeouts act on the tests.

- `ESG_TEST_TIMEOUT_MS` is the Playwright timeout. It bounds each test and each hook.
- `ESG_SESSION_CREATE_TIMEOUT_MS` is the `fetch` abort timeout on the create request. It bounds
  the HTTP call only.

A slow ESG cold start needs more than the Playwright default, so the code raises the timeout
where the session opens. Each test calls `test.setTimeout(...)` in its body. The refresh
`beforeAll` calls `test.setTimeout(...)` for the hook. `test.setTimeout` acts only on its own scope.

## Test files

- `tests/playwright-on-esg.spec.ts` — The standard path. Two independent tests each open a
  session, navigate the Playwright site, then delete the session.
- `tests/playwright-on-esg-device.spec.ts` — Phone emulation. One test for an iPhone on WebKit
  and one for an Android phone on Chromium.
- `tests/playwright-on-esg-refresh.spec.ts` — One shared session across two serial tests. The
  first runs the flow; the second refreshes, then runs the flow on the new browser.
- `tests/playwright-on-esg-parallel-refresh.spec.ts` — Two serial groups that run the refresh
  flow in parallel. Run with `npm run test:refresh:parallel`.
- `tests/playwright-on-esg-fileserver-clipboard.spec.ts` — The download endpoint, the clipboard
  endpoint, and both after a refresh. Run with `npm run test:fileserver-clipboard`.
- `tests/playwright-on-esg-refresh-isolation.spec.ts` — Data-driven over `ESG_PLAYWRIGHT_BROWSERS`.
  It proves the refresh clears the download path and returns a clean, isolated browser (no
  leftover contexts, cookies, or `localStorage`). Run with `npm run test:refresh-isolation`.

## Parallelism and the refresh

A refresh needs a shared session across two tests. This changes how you run the tests.

Playwright gives work to a worker in units:

- `fullyParallel: true` makes each test a unit. This project uses this mode.
- `test.describe.serial(...)` makes the whole group one unit on one worker.

The worker count acts by this formula:

```
workers used = min(workers, number of independent units)
```

- To run refresh scenarios in parallel, add one serial group for each parallel session, then
  set `ESG_WORKERS` to the group count.
- Each busy worker holds one live ESG task. Keep the worker count inside your grid concurrency
  limit and account quota.

## Shared code

`src/playwright-esg.ts` holds the shared helpers.

- `createEsgSession` — Sends the create request, validates the response, returns the session ID.
- `refreshEsgSession` — Sends the refresh request, validates the response, returns the new data.
- `deleteEsgSession` — Sends the delete request and logs the status with `currentTest.log.info`.
- `engineFor` — Maps an engine name to the Playwright `BrowserType`.
- `viewportFor` — Returns the per-engine viewport for the page.
- `runPlaywrightFlow` / `runPlaywrightScenario` — Connect, set the viewport, run the scenario.
- `requireEsgCredentials` — Fails early when a credential is absent.
- `setEsgClipboard` / `getEsgClipboard` — The clipboard endpoint.
- `downloadInPage`, `listEsgDownloads`, `fetchEsgDownload`, `deleteEsgDownload` — The download endpoint.
- `browsersUnderTest`, `downloadText`, `downloadFilename` — The data for the data-driven tests.

## Troubleshooting

- `returned non-JSON` — ESG returned an HTML page. The common cause is a wrong credential. Check
  `ESG_USER` and `ESG_PASSWORD`, or `ZEBRUNNER_HUB_URL`.
- `failed (<status>)` with an ESG message — ESG returned `{"value": {"error": "...", "message": "..."}}`.
  Read the ESG text for the cause.
- The browser does not start after a refresh — The refresh needs a disconnect first. Close the
  browser before the refresh.
- `"beforeAll" hook timeout ... exceeded` — The ESG cold start took more than the hook timeout.
  Raise `ESG_TEST_TIMEOUT_MS`.
- A version warning on connect — The client and the image run different Playwright versions.
  Match the versions and start a new session.
- `maxTouchPoints` is 0 on WebKit — This is normal on WebKit on Linux. Do not assert it.
- Firefox shows "The security sandbox is disabled" — This is expected. The image disables the
  Firefox content sandbox to run in the container, like `--no-sandbox` for Chromium.

## Playwright version match

The client and the ESG image must run the same Playwright version. The client is the
`@playwright/test` package. The image version is `PLAYWRIGHT_VERSION` in
`browser-images/playwright/Dockerfile`.

- Keep the same `major.minor` at a minimum, and the same exact version when you can.
- Pin exact versions on both sides.
- After a version bump, rebuild and push the image, then start a new session.
