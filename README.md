# Playwright on ESG

This project runs Playwright tests against ESG. ESG is the Zebrunner Elastic Selenium Grid. Each test starts a remote browser on ESG and connects to it over the native Playwright WebSocket.

The tests do not start a local browser. `connect()` attaches to the remote browser server on ESG.

## Requirements

- Node.js 18 or later. The code uses the global `fetch` and `AbortSignal.timeout`.
- Network access to an ESG host.
- ESG credentials, or a `ZEBRUNNER_HUB_URL` with credentials.

## Install

Run this command in the project root:

```bash
npm install
```

## Configure

The project reads configuration from environment variables. Playwright loads a `.env` file through `dotenv`.

To create your own `.env`, copy the template:

```bash
cp .env.example .env
```

### Connection

Set the ESG host and credentials with one of two methods.

- Set `ESG_HOST`, `ESG_USER`, and `ESG_PASSWORD` directly.
- Set `ZEBRUNNER_HUB_URL` with the credentials in the URL. The Zebrunner launcher uses this variable.

`ESG_HOST` default: `https://engine.zebrunner.dev`. The create request needs the credentials. An absent credential fails the test early with a clear message.

### Browser

- `ESG_PLAYWRIGHT_BROWSER_NAME` — The engine for the session. Values: `chromium`, `chrome`, `edge`, `firefox`, `webkit`, or `safari`. Default: `chromium`.
- `ESG_PLAYWRIGHT_VERSION` — The Playwright image tag, for example `1.58.2`. Default: the installed `@playwright/test` version.
- `ESG_PLAYWRIGHT_HEADLESS` — A boolean. Default: `false`.
- `ESG_PLAYWRIGHT_REFRESH_BROWSER_NAME` — The engine after the refresh. Default: the value of `ESG_PLAYWRIGHT_BROWSER_NAME`.

### Playwright version match

The client and the ESG image must run the same Playwright version. The client is the `@playwright/test` package in this project. The image is the version in `browser-images/playwright/Dockerfile` (`PLAYWRIGHT_VERSION`).

`connect()` speaks the Playwright wire protocol to the remote browser server. The protocol changes between minor versions. A mismatch prints a version warning and can fail with missing methods or changed payloads.

Rules:

- Keep the two versions the same. Use the same `major.minor` at a minimum, and the same exact version when you can.
- Pin exact versions on both sides. Do not use a range.
- After a version bump, rebuild and push the image, then start a new session. An old session keeps the old server version.

The current match is `1.58.2` on both sides.

### Window size and viewport

`runPlaywrightFlow` sets the page viewport per engine. The helper `viewportFor` in `src/playwright-esg.ts` makes the choice. The size comes from `ESG_SCREEN_RESOLUTION`. For example, `1920x1080x24` gives a `1920x1080` viewport.

The rule has three cases.

- Headless, any engine — The code sets the viewport to the screen size. No window exists, so the viewport sets the page size.
- Headed Chromium, Chrome, or Edge — The code sets the viewport to `null`. The image sizes the window with a launch argument. A client viewport would add browser chrome and clip the top of the window.
- Headed Firefox, WebKit, or Safari — The code sets the viewport to the screen size. These engines get no window-size launch argument, so the client viewport sizes the page to fill the screen.

To change the size, set `ESG_SCREEN_RESOLUTION`. This value drives both the viewport and the recording. To change the rule, edit `viewportFor`.

### Device emulation

The device tests emulate a phone with a Playwright device descriptor from `devices`. A descriptor sets the viewport, the user agent, the device scale factor, the mobile flag, and the touch flag.

Rules and restrictions:

- The ESG session engine must match the descriptor engine. An iPhone descriptor needs WebKit. A Pixel descriptor needs Chromium. The test reads `device.defaultBrowserType` and creates the session with that engine.
- Device emulation needs the mobile flag. Only Chromium and WebKit support the mobile flag. Firefox does not, so the device tests do not use Firefox.
- WebKit on Linux reports `navigator.maxTouchPoints` as `0`, even with touch emulation. The test does not assert `maxTouchPoints`. It asserts touch with a combined signal: `ontouchstart in window`, `maxTouchPoints > 0`, or the `(any-pointer: coarse)` media query.
- The test applies the descriptor to a context with `browser.newContext({ ...device })`. Do not set a separate viewport for the device flow. The descriptor sets it.

### Zebrunner session capabilities

The project sends these values in `zebrunner:options`.

- `ESG_CPU` — Task CPU units. Playwright uses a minimum of 1024.
- `ESG_MEMORY` — Task memory in MB. Playwright uses a minimum of 2048.
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

The code sends a default for the first six values. The code sends the other values only when you set them.

### Runner and timeouts

- `ESG_WORKERS` — The parallel worker count. Default: `1`.
- `ESG_RETRIES` — The retry count. Default: `0`.
- `ESG_TEST_TIMEOUT_MS` — The Playwright test timeout. Default: `120000`.
- `ESG_SESSION_CREATE_TIMEOUT_MS` — The timeout for the create request. Default: `600000`.
- `ESG_PLAYWRIGHT_REFRESH_TIMEOUT_MS` — The timeout for the refresh request. Default: `150000`.
- `ESG_STEP_PAUSE_MS` — A pause after each navigation. Default: `5000`.

### Timeout model

Two different timeouts act on the tests. Do not confuse them.

- `ESG_TEST_TIMEOUT_MS` is the Playwright timeout. It bounds each test and each hook. The default is `120000`.
- `ESG_SESSION_CREATE_TIMEOUT_MS` is the `fetch` abort timeout on the create request. It bounds the HTTP call only. It does not change any Playwright timeout.

A slow ESG cold start needs more than the Playwright default, so the code raises the timeout where the session opens.

- Each test calls `test.setTimeout(...)` in its body. This sets the timeout of that test. The tests use `createTimeoutMs + 120000` or `refreshTimeoutMs + 180000`.
- The refresh `beforeAll` calls `test.setTimeout(createTimeoutMs + 120000)`. Inside a hook, `test.setTimeout` sets the timeout of that hook.
- `test.setTimeout` acts only on its own scope. A call in a test does not change a hook, and a call in `beforeAll` does not change a test.
- The `afterAll` hook keeps the `ESG_TEST_TIMEOUT_MS` default. The delete request is fast, so this is safe.

The standard and device tests open the session inside the test body, so their own `test.setTimeout` is enough. The refresh tests open the session in `beforeAll`, so the hook needs its own `test.setTimeout`.

### Zebrunner reporting (optional)

The `@zebrunner/javascript-agent-playwright` reporter sends results to Zebrunner. The reporter is active only when `REPORTING_ENABLED` is `true` and both server values exist.

- `REPORTING_ENABLED` — `true` or `false`.
- `REPORTING_SERVER_HOSTNAME` — The Zebrunner host.
- `REPORTING_SERVER_ACCESS_TOKEN` — The Zebrunner access token.
- `REPORTING_PROJECT_KEY` — The project key. Default: `DEF`.
- `REPORTING_LAUNCH_DISPLAY_NAME`, `REPORTING_LAUNCH_BUILD`, and `REPORTING_LAUNCH_ENVIRONMENT` — The launch metadata.

## Run the tests

Run all tests:

```bash
npm test
```

Run one file:

```bash
npx playwright test playwright-on-esg.spec.ts
```

Run the device tests:

```bash
npx playwright test playwright-on-esg-device.spec.ts
```

Check the types without a run:

```bash
npm run typecheck
```

## How it works

### Session model

ESG starts one ECS task for each session. The task runs three containers: browser, recorder, and uploader.

The flow of one session has four steps.

1. The test sends `POST /session` with the capabilities. The create request needs basic authentication.
2. ESG returns a top-level `sessionId`, for example `{"sessionId": "<uuid>"}`.
3. Playwright connects to `wss://<host>/ws/playwright/<sessionId>`.
4. The test sends `DELETE /session/<sessionId>` to stop the task.

### Refresh model

The refresh request replaces the browser inside the same task. The task and its artifacts stay. The `POST /playwright/<sessionId>/refresh` request has no authentication middleware. The session ID is the credential.

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

A refresh creates a child session ID. The original ID and every child ID resolve to the same task. This behavior gives you two options:

- You can send the next refresh with the original ID or with the latest child ID. Both reach the same task.
- You can send the delete with the original ID or with any child ID. A delete with a child ID stops the complete session, not one segment.

This project keeps `originalSessionId` and uses it for the delete in `afterAll`. The latest child ID also works for a delete. The choice is safe either way.

After a delete, each ID of that session returns `409 session stopped` for 10 minutes. After 10 minutes, each ID returns `404 invalid session id`.

## Test files

### `tests/playwright-on-esg.spec.ts`

This file holds the standard path. Each test opens its own session and closes it. The file has two independent tests.

1. Create a session. Connect. Navigate the Playwright site. Delete the session.
2. Repeat the same flow with a second, independent session.

### `tests/playwright-on-esg-device.spec.ts`

This file emulates a phone. Each test opens its own session and closes it. The file has two independent tests.

1. Emulate an iPhone on WebKit. The test creates a WebKit session, applies the `iPhone 13` descriptor, then checks the viewport, the scale factor, the user agent, and touch.
2. Emulate an Android phone on Chromium. The test creates a Chromium session, applies the `Pixel 5` descriptor, then checks the same values.

Read the "Device emulation" section for the engine rule and the WebKit touch note.

### `tests/playwright-on-esg-refresh.spec.ts`

This file shares one ESG task across two tests in serial mode.

- `beforeAll` opens one session.
- The first test runs the flow on the created browser.
- The second test refreshes the browser, then runs the flow on the new browser.
- `afterAll` deletes the session.

Each test attaches one session to the report. This behavior lets Zebrunner link both the original browser and the refreshed browser.

### Behavior on failure and retry

A retry needs `ESG_RETRIES` greater than 0. Serial mode retries the whole group.

Playwright restarts the worker process on a test failure. The `beforeAll` hook then runs again in the new worker. The new `beforeAll` sends a new create request, so the retry gets a new main session. The retry does not reuse the failed session.

Playwright runs the applicable `afterAll` hook after the failure. The `afterAll` hook deletes the session from the failed run. Each run of the group creates one session and deletes one session.

### `tests/playwright-on-esg-parallel-refresh.spec.ts`

This file holds two serial groups. Each group opens its own session, runs the refresh flow, then deletes the session. A factory function adds each group, so the two groups share the same code.

The two groups are independent. Each group has its own session and its own original and child IDs.

Run this file with the script:

```bash
npm run test:refresh:parallel
```

## Parallelism and the refresh

A refresh needs a shared session across two tests. This need changes how you run the tests. Read this section before you set the worker count.

### The parallel unit

Playwright gives work to a worker process in units. The unit depends on the mode.

- `fullyParallel: true` makes each test a unit. This project uses this mode.
- `test.describe.serial(...)` makes the whole group one unit. The group stays on one worker in declared order.

The refresh flow uses a serial group. The group is one unit. Playwright does not split the group across workers.

### How the worker count acts

The formula is simple:

```
workers used = min(workers, number of independent units)
```

- The standard file has two independent tests. Two workers run both tests at the same time. This gives two ESG sessions at the same time.
- One refresh file has one serial group. The group uses one worker. A second worker stays idle for that file.
- The parallel refresh file has two serial groups. Two workers run both groups at the same time. This gives two refresh sessions at the same time.

### How to choose

- To run one refresh scenario, use one serial group. The worker count does not make the group faster.
- To run refresh scenarios in parallel, add one serial group for each parallel session. Then set `ESG_WORKERS` to the group count.
- Each busy worker holds one live ESG task. Keep the worker count inside your grid concurrency limit and account quota.

## Shared code

`src/playwright-esg.ts` holds the shared helpers.

- `createEsgSession` — Sends the create request. Validates the response. Returns the session ID. Takes an optional engine name and defaults to `ESG_PLAYWRIGHT_BROWSER_NAME`. The device tests pass the engine of the descriptor.
- `refreshEsgSession` — Sends the refresh request. Validates the response. Returns the new session data.
- `deleteEsgSession` — Sends the delete request, then logs the status with `currentTest.log.info` so the line shows one time.
- `engineFor` — Maps an engine name to the Playwright `BrowserType`.
- `viewportFor` — Returns the per-engine viewport for the page. See "Window size and viewport".
- `runPlaywrightFlow` — Connects over the WebSocket, sets the viewport per engine with `viewportFor`, runs the scenario, then closes the browser.
- `runPlaywrightScenario` — Runs three page navigations with clicks and a text input on the Playwright site.
- `requireEsgCredentials` — Fails early when a credential is absent.

## Troubleshooting

### `returned non-JSON`

ESG returned an HTML page, not JSON. The common cause is an empty or wrong credential. The create request then gets an HTML error page. Check `ESG_USER` and `ESG_PASSWORD`, or `ZEBRUNNER_HUB_URL`.

### `failed (<status>)` with an ESG message

ESG returned an error body of the form `{"value": {"error": "...", "message": "..."}}`. The test message shows the status and the ESG text. Read the ESG text for the cause.

### The browser does not start after a refresh

The refresh needs a disconnect first. The first test closes the browser before the second test sends the refresh. Keep this order.

### `"beforeAll" hook timeout ... exceeded`

The `beforeAll` hook opened the session, and the ESG cold start took more than the hook timeout. The hook uses the `ESG_TEST_TIMEOUT_MS` default, not the create fetch timeout. The refresh hooks raise the hook timeout with `test.setTimeout`. Read the "Timeout model" section. Raise `ESG_TEST_TIMEOUT_MS` if the cold start is often slow.

### The delete line shows two times

The reporter echoes plain console output. Use `currentTest.log.info`, not `console.*`. Read the "Console output and logs" section.

### A version warning on connect

The client and the image run different Playwright versions. Match the versions and start a new session. Read the "Playwright version match" section.

### `maxTouchPoints` is 0 on WebKit

This is normal on WebKit on Linux. Do not assert `maxTouchPoints` for WebKit. Read the "Device emulation" section.
