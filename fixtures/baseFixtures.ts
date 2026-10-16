
import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { DiscoveryPage } from '../pages/DiscoveryPage';
import { DiscoveryFile, prepareDiscoveryFile } from './discoveryFile';
import { DiscoveryUploadPage } from '../pages/DiscoveryUploadPage';
import { DiscoveryDashboardPage } from '../pages/DiscoveryDashboardPage';
import { EnterpriseDashboardPage } from '../pages/EnterpriseDashboardPage';
import { freshClusterDataset, registeredClusterDataset, existingWorkflowDataset, FreshClusterDataset,
  RegisteredClusterDataset, ExistingWorkflowDataset, TestDataPrerequisiteError } from './discoveryData';
import { DiscoveryApiEvidence } from '../api/DiscoveryApiEvidence';
import type { TestInfo } from '@playwright/test';
import { finishPrivateDiagnostics } from './privateDiagnostics';

type AppFixtures = {
  privateFailureDiagnostics: void;
  loginPage: LoginPage;
  discoveryPage: DiscoveryPage;
  discoveryFile: DiscoveryFile;
  registeredDiscoveryFile: DiscoveryFile;
  freshDiscoveryData: FreshClusterDataset;
  registeredDiscoveryData: RegisteredClusterDataset;
  existingWorkflowData: ExistingWorkflowDataset;
  discoveryApi: DiscoveryApiEvidence;
  discoveryUploadPage: DiscoveryUploadPage;
  discoveryDashboardPage: DiscoveryDashboardPage;
  enterpriseDashboardPage: EnterpriseDashboardPage;
};

export const test = base.extend<AppFixtures>({
  privateFailureDiagnostics: [async ({ page, context }, use, testInfo) => {
    if (!process.env.CI && !testInfo.tags.includes('@nexus')) { await use(); return; }
    await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
    try { await use(); }
    finally { await finishPrivateDiagnostics(page, context, testInfo); }
  }, { auto: true }],
  discoveryApi: async ({ page }, use) => { await use(new DiscoveryApiEvidence(page)); },
  freshDiscoveryData: async ({}, use, testInfo) => {
    await prerequisite(testInfo, async () => { await use(freshClusterDataset()); });
  },
  registeredDiscoveryData: async ({}, use, testInfo) => {
    await prerequisite(testInfo, async () => { await use(registeredClusterDataset()); });
  },
  existingWorkflowData: async ({}, use) => { await use(existingWorkflowDataset()); },
  discoveryDashboardPage: async ({ page }, use) => {
    await use(new DiscoveryDashboardPage(page));
  },
  enterpriseDashboardPage: async ({ page }, use) => {
    await use(new EnterpriseDashboardPage(page));
  },
  discoveryUploadPage: async ({ page }, use) => {
    await use(new DiscoveryUploadPage(page));
  },
  discoveryFile: async ({ freshDiscoveryData }, use, testInfo) => {
    const prepared = await prerequisite(testInfo, () => prepareDiscoveryFile(freshDiscoveryData));
    try {
      await testInfo.attach('discovery-upload-metadata', {
        body: JSON.stringify({ filename: prepared.file.filename, sha256: prepared.file.sha256 }),
        contentType: 'application/json',
      });
      await use(prepared.file);
    } finally {
      await prepared.dispose();
    }
  },
  registeredDiscoveryFile: async ({ registeredDiscoveryData }, use, testInfo) => {
    const prepared = await prerequisite(testInfo, () => prepareDiscoveryFile(registeredDiscoveryData));
    try {
      await testInfo.attach('registered-upload-metadata', {
        body: JSON.stringify({ filename: prepared.file.filename, sha256: prepared.file.sha256, purpose: 'registered' }),
        contentType: 'application/json',
      });
      await use(prepared.file);
    } finally { await prepared.dispose(); }
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  discoveryPage: async ({ page }, use) => {
    await use(new DiscoveryPage(page));
  },
});

async function prerequisite<T>(testInfo: TestInfo, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error instanceof TestDataPrerequisiteError) {
      testInfo.annotations.push({ type: 'BLOCKED', description: error.message });
    }
    throw error;
  }
}

export { expect } from '@playwright/test';
