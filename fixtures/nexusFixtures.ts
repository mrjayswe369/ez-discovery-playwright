import { test as base } from './baseFixtures';
import { NexusPage } from '../pages/NexusPage';
import { NexusApiEvidence } from '../api/NexusApiEvidence';

type NexusFixtures = {
  nexusPage: NexusPage;
  nexusApi: NexusApiEvidence;
  nexusDiagnostics: { startAfterLogin: () => Promise<void>; violations: string[]; runtimeErrors: string[] };
};

export const test = base.extend<NexusFixtures>({
  nexusPage: async ({ page }, use) => { await use(new NexusPage(page)); },
  nexusApi: async ({ page }, use) => { await use(new NexusApiEvidence(page)); },
  nexusDiagnostics: async ({ page }, use) => {
    const violations: string[] = [];
    const runtimeErrors: string[] = [];
    const allowedReadPosts = /\/discovery\/workflow\/(?:list|ai-oppurtunity-summary|ai-oppurtunity-features|platform-summary\/(?:summary-cards|device-charts|feature-charts|enterprise-category|license-insights|reseller-insights|trunk-insights|churn-risk-enterprises|migration-ready-enterprises))$/;
    await use({ violations, runtimeErrors, startAfterLogin: async () => {
      page.on('pageerror', error => { runtimeErrors.push(error.name); });
      await page.route('**/discovery/**', async route => {
        const request = route.request();
        if (['GET', 'HEAD', 'OPTIONS'].includes(request.method()) ||
            (request.method() === 'POST' && allowedReadPosts.test(new URL(request.url()).pathname))) {
          await route.continue();
        } else {
          violations.push(`${request.method()} unexpected discovery operation`);
          await route.abort('blockedbyclient');
        }
      });
    } });
  },
});
export { expect } from '@playwright/test';
