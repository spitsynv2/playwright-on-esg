import { chromium, expect, firefox, webkit } from '@playwright/test';
import type { BrowserType, Page } from '@playwright/test';
import { currentTest } from '@zebrunner/javascript-agent-playwright';
import playwrightPackage from '@playwright/test/package.json';

const hub = process.env.ZEBRUNNER_HUB_URL ? new URL(process.env.ZEBRUNNER_HUB_URL) : undefined;

export const esgHost = (process.env.ESG_HOST || hub?.origin || '').replace(/\/+$/, '');
export const esgWsHost = esgHost.replace(/^http/, 'ws');
const esgUser = process.env.ESG_USER || hub?.username || '';
const esgPassword = process.env.ESG_PASSWORD || hub?.password || '';
const authorization = `Basic ${Buffer.from(`${esgUser}:${esgPassword}`, 'utf8').toString('base64')}`;

export const browserName = process.env.ESG_PLAYWRIGHT_BROWSER_NAME || 'chromium';
export const playwrightVersion = process.env.ESG_PLAYWRIGHT_VERSION || playwrightPackage.version;
export const headless = String(process.env.ESG_PLAYWRIGHT_HEADLESS).toLowerCase() === 'true';
export const refreshBrowserName = process.env.ESG_PLAYWRIGHT_REFRESH_BROWSER_NAME || browserName;

export const createTimeoutMs = Number(process.env.ESG_SESSION_CREATE_TIMEOUT_MS || 600_000);
export const refreshTimeoutMs = Number(process.env.ESG_PLAYWRIGHT_REFRESH_TIMEOUT_MS || 150_000);
const stepPauseMs = Number(process.env.ESG_STEP_PAUSE_MS || 5000);

function envString(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function envNumber(name: string): number | undefined {
  const raw = envString(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function envBoolean(name: string): boolean | undefined {
  const raw = envString(name)?.toLowerCase();
  if (raw === undefined) return undefined;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return undefined;
}

function parseViewport(resolution: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)/.exec(resolution);
  if (!match) return { width: 1920, height: 1080 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

// Firefox and WebKit do not take a window-size launch arg, so the client viewport must
// set the size. A headed browser resizes its window to this viewport.
const screenViewport = parseViewport(envString('ESG_SCREEN_RESOLUTION') ?? '1920x1080x24');

function zebrunnerOptions(): Record<string, unknown> {
  const options: Record<string, unknown> = {
    enableVideo: envBoolean('ESG_ENABLE_VIDEO') ?? true,
    enableVNC: envBoolean('ESG_ENABLE_VNC') ?? true,
    enableLog: envBoolean('ESG_ENABLE_LOG') ?? true,
    enableDebug: envBoolean('ESG_ENABLE_DEBUG') ?? false,
    screenResolution: envString('ESG_SCREEN_RESOLUTION') ?? '1920x1080x24',
    idleTimeout: envNumber('ESG_IDLE_TIMEOUT') ?? 300,
  };

  const optional: Record<string, string | number | undefined> = {
    cpu: envNumber('ESG_CPU'),
    memory: envNumber('ESG_MEMORY'),
    maxTimeout: envNumber('ESG_MAX_TIMEOUT'),
    videoScreenSize: envString('ESG_VIDEO_SCREEN_SIZE'),
    frameRate: envNumber('ESG_FRAME_RATE'),
    timeZone: envString('ESG_TIME_ZONE'),
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) options[key] = value;
  }
  return options;
}

function buildSessionRequest(engine: string) {
  return {
    capabilities: {
      alwaysMatch: {
        platformName: 'playwright',
        browserName: engine,
        playwrightVersion,
        headless,
        'zebrunner:options': zebrunnerOptions(),
      },
    },
  };
}

export type EsgRefresh = {
  sessionId?: string;
  originalSessionId?: string;
  browserType?: string;
  generation?: number;
};

// ESG rejects unauthenticated create requests with an HTML page, not JSON, so guard early.
export function requireEsgCredentials(): void {
  if (!esgHost) {
    throw new Error('Missing ESG host. Set ESG_HOST, or ZEBRUNNER_HUB_URL with the host.');
  }
  if (!esgUser || !esgPassword) {
    throw new Error(
      `Missing ESG credentials for ${esgHost}. Set ESG_USER and ESG_PASSWORD, or ZEBRUNNER_HUB_URL with credentials.`,
    );
  }
}

async function readEsgJson(response: Response, label: string): Promise<Record<string, unknown>> {
  const text = (await response.text()).trim();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`${label} returned non-JSON (${response.status}) from ${esgHost}: ${text.slice(0, 500)}`);
  }
}

// ESG can answer with 2xx and an error body { value: { error, message } } instead of a session.
function esgError(body: Record<string, unknown>): string | undefined {
  const value = body.value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const { error, message } = value as { error?: unknown; message?: unknown };
    if (typeof error === 'string' && error) {
      return typeof message === 'string' && message ? `${error}: ${message}` : error;
    }
  }
  if (typeof body.error === 'string' && body.error) {
    return typeof body.message === 'string' && body.message ? `${body.error}: ${body.message}` : body.error;
  }
  return undefined;
}

function assertEsgSessionId(body: Record<string, unknown>, response: Response, label: string): string {
  const error = esgError(body);
  expect(response.ok && !error, `${label} failed (${response.status}): ${error || JSON.stringify(body)}`).toBe(true);
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  expect(sessionId, `${label} returned no sessionId: ${JSON.stringify(body)}`).toBeTruthy();
  return sessionId;
}

export function engineFor(name: string): BrowserType {
  const engine = name.replace(/^playwright-/, '').toLowerCase();
  if (engine === 'firefox') return firefox;
  if (engine === 'webkit' || engine === 'safari') return webkit;
  return chromium;
}

// Chromium's window is sized by the image launch arg, so a client viewport only adds
// browser chrome and clips the top; Firefox and WebKit have no such arg and need the viewport.
function viewportFor(engineName: string): { width: number; height: number } | null {
  if (headless) return screenViewport;
  const engine = engineName.replace(/^playwright-/, '').toLowerCase();
  if (engine === 'chromium' || engine === 'chrome') return null;
  return screenViewport;
}

export function reportingCapabilities(engineName: string, browserVersion: string = playwrightVersion) {
  return {
    browserName: engineName.replace(/^playwright-/, ''),
    browserVersion,
    platformName: 'linux',
    'zebrunner:provider': 'ZEBRUNNER',
  };
}

export async function runPlaywrightScenario(page: Page): Promise<void> {
  // Navigation 1: the home page.
  await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
  await expect(page).toHaveTitle(/Playwright/);
  await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible();
  await page.waitForTimeout(stepPauseMs);

  // Navigation 2: click into the docs.
  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page).toHaveURL(/\/docs\/intro/);
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
  await page.waitForTimeout(stepPauseMs);

  // Write: open the search dialog and type a query.
  await page.getByRole('button', { name: /Search/ }).first().click();
  const searchInput = page.getByPlaceholder('Search docs');
  await searchInput.fill('locators');
  await expect(searchInput).toHaveValue('locators');
  await page.waitForTimeout(stepPauseMs);
  await page.keyboard.press('Escape');

  // Navigation 3: follow a sidebar link.
  await page.getByRole('link', { name: 'Writing tests', exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/writing-tests/);
  await expect(page.getByRole('heading', { name: 'Writing tests' })).toBeVisible();
  await page.waitForTimeout(stepPauseMs);
}

export async function createEsgSession(engine: string = browserName): Promise<string> {
  const createResponse = await fetch(`${esgHost}/session`, {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSessionRequest(engine)),
    signal: AbortSignal.timeout(createTimeoutMs),
  });
  const created = await readEsgJson(createResponse, 'POST /session');
  return assertEsgSessionId(created, createResponse, 'POST /session');
}

export async function refreshEsgSession(sessionId: string, engineName: string): Promise<EsgRefresh> {
  const label = `POST /playwright/${sessionId}/refresh`;
  const response = await fetch(`${esgHost}/playwright/${sessionId}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ browserName: engineName }),
    signal: AbortSignal.timeout(refreshTimeoutMs),
  });
  const body = (await readEsgJson(response, label)) as { value?: EsgRefresh };
  const error = esgError(body);
  expect(response.ok && !error, `${label} failed (${response.status}): ${error || JSON.stringify(body)}`).toBe(true);
  const value = body.value || {};
  expect(value.sessionId, `${label} returned no sessionId: ${JSON.stringify(body)}`).toBeTruthy();
  return value;
}

export async function deleteEsgSession(sessionId: string): Promise<void> {
  const deleteResponse = await fetch(`${esgHost}/session/${sessionId}`, { method: 'DELETE' });
  currentTest.log.info(`DELETE /session/${sessionId} returned ${deleteResponse.status}.`);
}

export async function runPlaywrightFlow(engineName: string, sessionId: string): Promise<void> {
  const browser = await engineFor(engineName).connect(`${esgWsHost}/ws/playwright/${sessionId}`);
  try {
    const caps = reportingCapabilities(browser.browserType().name(), browser.version());
    currentTest.attachSessionCapabilities(caps, sessionId);
    currentTest.log.info(`Session ${sessionId} on ${caps.browserName} ${caps.browserVersion}.`);
    const page = await browser.newPage({ viewport: viewportFor(browser.browserType().name()) });
    await runPlaywrightScenario(page);
  } finally {
    await browser.close();
  }
}
