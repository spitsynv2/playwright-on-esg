import { expect } from '@playwright/test';
import { currentLaunch, currentTest, zebrunner } from '@zebrunner/javascript-agent-playwright';
import { test } from '@zebrunner/javascript-agent-playwright/session-fixture';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Reporting smoke suite. Every test exercises one group of the agent's reporting
// API and states what to look for in Zebrunner, so a launch from this file is
// enough to tell whether reporting still works end to end.
//
// The suite is browser-agnostic and mode-agnostic: it runs on an ESG session and
// on a local browser (REMOTE_SESSION_ENABLED=false). Only the test-session test
// asserts remote-only data, and it skips itself in local mode.
//
// The assertions can only cover what the test process can see: the agent sends
// its data over stdout events and uploads it from the reporter process, so a
// green run means the calls were accepted and the payloads were valid. Confirm
// the launch itself in Zebrunner (or through the reporting API) after the run.

const LAUNCH_LABEL_KEY = 'suite';
const LAUNCH_LABEL_VALUE = 'esg-reporting-smoke';

test.beforeAll(async () => {
  // Launch-scoped data. It is attached once and belongs to the whole launch,
  // not to the test that happens to run first.
  currentLaunch.attachLabel(LAUNCH_LABEL_KEY, LAUNCH_LABEL_VALUE);
  currentLaunch.attachLabel('automation-type', 'web', 'esg');
  currentLaunch.attachArtifactReference('Playwright', 'https://playwright.dev/');

  const launchNote = writeTempFile('launch-note.txt', `launch reporting smoke ${new Date().toISOString()}\n`);
  currentLaunch.attachArtifact(launchNote, 'launch-note.txt');
  currentLaunch.attachArtifact(Buffer.from('launch buffer artifact\n', 'utf8'), 'launch-buffer.txt');
});

test.describe('Zebrunner reporting on ESG', () => {
  // Zebrunner: the test shows maintainer "anonymous" unless a Zebrunner user
  // named by REPORTING_MAINTAINER exists, and carries INFO/WARN/ERROR/DEBUG/
  // TRACE/FATAL plus one custom-level log line.
  test('reports a maintainer and every custom log level', async ({ page }) => {
    currentTest.setMaintainer(process.env.REPORTING_MAINTAINER || 'anonymous');

    currentTest.log.info('INFO level log message on test start');
    currentTest.log.debug('DEBUG level log message');
    currentTest.log.trace('TRACE level log message');

    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
    await expect(page).toHaveTitle(/Playwright/);

    // console.log() reaches Zebrunner too, unless logs.ignoreConsole is on.
    console.log('console.log line captured by the agent');
    // A line with the consoleOnlyPrefix stays in the terminal and is not reported.
    console.log('reporting-agent: terminal-only line, must not reach Zebrunner');

    currentTest.log.warn('WARN level log message');
    currentTest.log.error('ERROR level log message');
    currentTest.log.fatal('FATAL level log message');
    currentTest.log.custom('CUSTOM_LEVEL level log message', 'CUSTOM_LEVEL');
    currentTest.log.info('INFO level log message on test finish');
  });

  // Zebrunner: the test carries the labels below. `@smoke` and `@reporting` come
  // from the title as values of the `tag` label, so the title tags and the
  // attachLabel() calls must both show up.
  test('reports labels from the title and from attachLabel @smoke @reporting', async ({ page }) => {
    currentTest.attachLabel('feature', 'reporting');
    // One key can hold several values.
    currentTest.attachLabel('priority', 'high', 'release-blocker');

    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
    await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible();
  });

  // Zebrunner: the test shows one artifact reference and four artifacts. The
  // unnamed buffer is named file_<ISO timestamp> by the agent.
  test('reports artifact references and artifacts', async ({ page }) => {
    currentTest.attachArtifactReference('System under test', 'https://playwright.dev/');

    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
    await expect(page).toHaveTitle(/Playwright/);

    const pageHtml = await page.content();

    // From a path on disk, keeping the file name.
    const reportPath = writeTempFile('page-source.html', pageHtml);
    currentTest.attachArtifact(reportPath);

    // From a path on disk, with an explicit name.
    currentTest.attachArtifact(reportPath, 'renamed-page-source.html');

    // From a Buffer, with an explicit name.
    currentTest.attachArtifact(Buffer.from(`title: ${await page.title()}\n`, 'utf8'), 'page-title.txt');

    // From a Buffer with no name: the agent generates file_<ISO timestamp>.
    currentTest.attachArtifact(Buffer.from('unnamed buffer artifact\n', 'utf8'));
  });

  // Zebrunner: the test shows two screenshots from the agent API, plus the
  // end-of-test screenshot Playwright takes when use.screenshot is not 'off'.
  test('reports screenshots from a buffer and from a path', async ({ page }) => {
    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
    await expect(page).toHaveTitle(/Playwright/);

    // A Buffer straight from Playwright.
    currentTest.attachScreenshot(await page.screenshot({ fullPage: true }));

    // The same shot through a file on disk.
    const shotPath = path.join(os.tmpdir(), `zbr-esg-shot-${Date.now()}.png`);
    await page.screenshot({ path: shotPath });
    currentTest.attachScreenshot(shotPath);
  });

  // Zebrunner: the test links four Zebrunner TCM test cases. Three take the
  // launch's result status; REPORTING_TCM_CASE_SKIPPED is pinned to SKIPPED.
  // Linking always happens. Pushing the results to Zebrunner TCM additionally
  // needs tcm.zebrunner.pushResults and a testRunId, and the case keys below
  // must exist in that Test Run.
  test('links Zebrunner TCM test cases and pins one result status', async ({ page }) => {
    const projectKey = process.env.REPORTING_PROJECT_KEY || 'DEF';

    zebrunner.testCaseKey(`${projectKey}-1`);
    zebrunner.testCaseKey(`${projectKey}-2`, `${projectKey}-3`);
    zebrunner.testCaseStatus(process.env.REPORTING_TCM_CASE_SKIPPED || `${projectKey}-4`, 'SKIPPED');

    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
    await expect(page).toHaveTitle(/Playwright/);
  });

  // Zebrunner: the test has a test session with the ESG browser and session id.
  // The session fixture calls attachSessionCapabilities() for us, so the test
  // only has to prove the session data it reports is real.
  test.describe('remote session reporting', () => {
    // `remoteSession` throws on a local browser, and a fixture error cannot be
    // caught from the test body, so the skip has to be declared here instead.
    test.skip(!remoteSessionExpected(), 'Needs a remote ESG session');

    test('runs on an ESG session that the agent can report', async ({ page, remoteSession }) => {
      expect(remoteSession.sessionId, 'ESG session id').toBeTruthy();
      expect(remoteSession.originalSessionId, 'ESG root session id').toBeTruthy();
      expect(remoteSession.browserName, 'ESG browser name').toBeTruthy();

      // Make the session id visible in the report, so a Zebrunner test can be
      // matched against an ESG session and its server-side video.
      currentTest.attachArtifactReference('ESG session', remoteSession.sessionId);
      currentTest.log.info(`ESG session ${remoteSession.sessionId} on ${remoteSession.browserName}`);

      await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
      await expect(page).toHaveTitle(/Playwright/);

      // Video on a remote run is the grid's server-side recording, so the
      // fixture does not record a Playwright video here and use.video is not
      // applied. attachVideo() stays available for a video the test makes itself.
    });
  });

  // Zebrunner: this test must NOT appear in the launch, and the launch total
  // must be one lower than the number of tests Playwright ran.
  test('is reverted and must not appear in the launch', async ({ page }) => {
    currentTest.revertRegistration();

    // revertRegistration() does not stop the test; the rest still runs.
    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
    await expect(page).toHaveTitle(/Playwright/);
  });

  // Zebrunner: the test is SKIPPED. With launch.treatSkipsAsFailures on (the
  // default) the launch result counts it as a failure, but the test result
  // itself stays SKIPPED.
  test('reports a skipped test', async ({ page }) => {
    test.skip(true, 'Reported to Zebrunner as SKIPPED on purpose');
    await page.goto('https://playwright.dev/', { waitUntil: 'commit' });
  });
});

// Mirrors the fixture's own local/remote decision: the explicit flag first, then
// the presence of a host.
function remoteSessionExpected(): boolean {
  const flag = process.env.REMOTE_SESSION_ENABLED?.trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return Boolean(process.env.ZEBRUNNER_HUB_URL || process.env.REMOTE_HOST_URL);
}

function writeTempFile(name: string, contents: string): string {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zbr-esg-report-')), name);
  fs.writeFileSync(filePath, contents);
  return filePath;
}
