import { expect, test } from '@zebrunner/javascript-agent-playwright/remote';

import { runPlaywrightScenario } from '../src/scenario';

// Refresh mode (set by the `refresh` project) across parallel workers. Each serial group
// is one parallel unit, so with enough workers the groups run at once, each on its own session.
function defineSharedRefreshGroup(title: string) {
  test.describe.serial(title, () => {
    let originalSessionId = '';
    let lastGeneration = 0;

    test('runs the flow on the created session', async ({ page, remoteSession }) => {
      originalSessionId = remoteSession.originalSessionId;
      lastGeneration = remoteSession.generation ?? 0;
      await runPlaywrightScenario(page);
    });

    test('refreshes the browser, then runs the same flow on the new session', async ({ page, remoteSession }) => {
      expect(remoteSession.originalSessionId).toBe(originalSessionId);
      expect(remoteSession.generation ?? 0, 'refresh did not advance the generation').toBeGreaterThan(lastGeneration);
      lastGeneration = remoteSession.generation ?? 0;
      await runPlaywrightScenario(page);
    });

    test('refreshes the browser again, then runs the same flow a third time', async ({ page, remoteSession }) => {
      expect(remoteSession.originalSessionId).toBe(originalSessionId);
      expect(remoteSession.generation ?? 0, 'refresh did not advance the generation').toBeGreaterThan(lastGeneration);
      lastGeneration = remoteSession.generation ?? 0;
      await runPlaywrightScenario(page);
    });
  });
}

defineSharedRefreshGroup('Playwright on ESG shared session A');
defineSharedRefreshGroup('Playwright on ESG shared session B');
defineSharedRefreshGroup('Playwright on ESG shared session C');
defineSharedRefreshGroup('Playwright on ESG shared session D');
defineSharedRefreshGroup('Playwright on ESG shared session E');
defineSharedRefreshGroup('Playwright on ESG shared session F');
defineSharedRefreshGroup('Playwright on ESG shared session G');
defineSharedRefreshGroup('Playwright on ESG shared session H');
