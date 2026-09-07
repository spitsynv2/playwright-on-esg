import { expect, test } from '@zebrunner/javascript-agent-playwright/remote';

import { runPlaywrightScenario } from '../src/scenario';

// Refresh mode (set by the `refresh` project): one ESG session per worker, refreshed between
// tests, deleted at worker end. A serial group runs in one worker, so the session is shared.
test.describe.serial('Playwright on ESG shared session', () => {
  let originalSessionId = '';
  let lastGeneration = 0;

  test('runs the flow on the created session', async ({ page, remoteSession }) => {
    originalSessionId = remoteSession.originalSessionId;
    lastGeneration = remoteSession.generation ?? 0;
    await runPlaywrightScenario(page);
  });

  test('refreshes the browser, then runs the same flow on the new session', async ({ page, remoteSession }) => {
    expect(remoteSession.originalSessionId, 'refresh changed the original session').toBe(originalSessionId);
    expect(remoteSession.generation ?? 0, 'refresh did not advance the generation').toBeGreaterThan(lastGeneration);
    lastGeneration = remoteSession.generation ?? 0;
    await runPlaywrightScenario(page);
  });
});
