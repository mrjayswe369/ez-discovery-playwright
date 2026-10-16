import { test, expect } from '../fixtures/baseFixtures';
import { requireDiscoveryData } from './support/discoveryPrerequisites';
import type { DiscoveryWorkflowSnapshot } from '../api/DiscoveryApiEvidence';

test.describe('Cluster uniqueness business validation', { tag: ['@repeatable', '@registered-data', '@duplicate-cluster'] }, () => {
  test.describe.configure({ retries: 0 });

  test('DISC-003: Reject duplicate discovery for an already registered cluster', async ({
    page, loginPage, discoveryPage, discoveryApi, discoveryUploadPage, discoveryDashboardPage,
    registeredDiscoveryData: dataset, registeredDiscoveryFile,
  }) => {
    test.setTimeout(240000);
    const { TEST_EMAIL: email, TEST_PASSWORD: password } = process.env;
    if (!email || !password) throw new Error('QA test credentials are missing');
    let inventory: DiscoveryWorkflowSnapshot[] = [];
    await test.step('Login and confirm registered-cluster test prerequisites', async () => {
      await loginPage.goto();
      inventory = await discoveryApi.workflows(() => loginPage.login(email, password));
      await expect(discoveryPage.heading).toBeVisible({ timeout: 30000 });
    });
    const landscapeUrl = page.url();
    const registered = inventory.filter(workflow => workflow.clusterId === dataset.clusterId);
    requireDiscoveryData(registered.some(workflow => workflow.status === 'Completed'),
      'Registered fixture must identify an existing completed cluster. No upload was attempted.');
    expect(registered, 'The registered cluster must initially have exactly one workflow').toHaveLength(1);
    const original = registered[0];
    const existing = [...inventory];
    const originalInsights = await test.step('Fingerprint the existing completed discovery without changing it', async () => {
      const fingerprint = await discoveryApi.insightFingerprint(original.id, () => discoveryPage.openCompletedWorkflow(original.name));
      await expect(discoveryDashboardPage.enterpriseTiles.first()).toBeVisible({ timeout: 30000 });
      inventory = await discoveryApi.workflows(() => page.goto(landscapeUrl, { waitUntil: 'domcontentloaded' }));
      return fingerprint;
    });

    const attempts = inventory.filter(workflow => workflow.name === dataset.attemptWorkflowName);
    requireDiscoveryData(attempts.length <= 1, 'Duplicate-attempt workflow name is ambiguous; configure a unique dedicated name.');
    let attempt = attempts[0];
    requireDiscoveryData(Boolean(attempt) || !dataset.reuseOnly,
      'CI duplicate validation requires the configured reusable empty pending workflow. Initialize it explicitly outside CI; no workflow will be created.');
    if (attempt) {
      requireDiscoveryData(attempt.status === null && attempt.clusterId === '' && attempt.provisioningFileCount === 0,
        'The duplicate-attempt workflow must be empty and pending. Existing completed or populated workflows will not be used for uploads.');
    }
    let creationAllowed = !attempt;
    let attemptId = attempt?.id;
    let uploadCount = 0;
    let creationCount = 0;
    const violations: string[] = [];
    await page.route('**/discovery/**', async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      const readOnlyPost = ['/discovery/workflow/list',
        '/discovery/workflow/platform-summary/churn-risk-enterprises',
        '/discovery/workflow/platform-summary/migration-ready-enterprises'].includes(pathname);
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method()) ||
          (request.method() === 'POST' && readOnlyPost)) {
        await route.continue();
      } else if (request.method() === 'POST' && pathname === '/discovery/workflow/create' && creationAllowed && creationCount === 0) {
        creationCount++;
        await route.continue();
      } else if (request.method() === 'POST' && pathname === `/discovery/workflow/${attemptId}/create-insight` && uploadCount === 0) {
        uploadCount++;
        await route.continue();
      } else {
        violations.push(`${request.method()} unexpected discovery mutation`);
        await route.abort('blockedbyclient');
      }
    });

    try {
      await test.step('Reuse an empty pending attempt, creating one only when required by the upload screen', async () => {
        if (!attempt) {
          await discoveryPage.openCreateWorkflow();
          await expect(discoveryPage.workflowDialog).toBeVisible();
          await discoveryPage.fillWorkflow({ name: dataset.attemptWorkflowName,
            sourcePlatform: 'Broadworks', targetPlatform: 'Cisco - Webex', deploymentType: 'Lab' });
          await expect(discoveryPage.clusterIdDropdown).toHaveText('');
          inventory = await discoveryApi.workflows(() => discoveryPage.submitWorkflow());
          await expect(discoveryPage.workflowDialog).toBeHidden();
          const created = inventory.filter(workflow => workflow.name === dataset.attemptWorkflowName);
          expect(created, 'One dedicated pending attempt must be created').toHaveLength(1);
          attempt = created[0];
          attemptId = attempt.id;
          expect(inventory.map(workflow => workflow.id).sort()).toEqual([...existing.map(workflow => workflow.id), attempt.id].sort());
        }
        creationAllowed = false;
        expect(attempt.status, 'Attempt must not have been processed').toBeNull();
        expect(attempt.clusterId).toBe('');
        expect(attempt.provisioningFileCount).toBe(0);
        await expect(discoveryPage.workflowStatus(dataset.attemptWorkflowName)).toBeVisible();
        await discoveryPage.workflowName(dataset.attemptWorkflowName).click();
        await expect(discoveryUploadPage.fileInput).toBeAttached();
      });

      await test.step('Upload the unchanged registered-cluster GZIP once and verify documented rejection', async () => {
        const result = await discoveryUploadPage.submitFile(registeredDiscoveryFile);
        expect(result.status, 'Duplicate discovery must return HTTP 400').toBe(400);
        expect(result.statusCode).toBe(400);
        expect(result.message).toBe('Workflow already exists for cluster');
        expect(result.error, 'Backend must identify the fixture cluster').toBe(dataset.clusterId);
        await expect(discoveryUploadPage.duplicateClusterError).toBeVisible();
        await expect(discoveryUploadPage.continueButton).not.toBeVisible();
      });

      await test.step('Verify no duplicate completed workflow and no changes to existing discovery data', async () => {
        const after = await discoveryApi.workflows(() => page.goto(landscapeUrl, { waitUntil: 'domcontentloaded' }));
        expect(after.map(workflow => workflow.id).sort(), 'Rejected upload must not add any workflow').toEqual(inventory.map(workflow => workflow.id).sort());
        expect(after.filter(workflow => workflow.status === 'Completed').map(workflow => workflow.id).sort(),
          'Completed workflow membership must remain unchanged').toEqual(existing.filter(workflow => workflow.status === 'Completed').map(workflow => workflow.id).sort());
        for (const before of existing) {
          expect(after.find(workflow => workflow.id === before.id)?.fingerprint,
            'Pre-existing workflow metadata and provisioning references must remain unchanged').toBe(before.fingerprint);
        }
        expect(after.filter(workflow => workflow.clusterId === dataset.clusterId).map(workflow => workflow.id)).toEqual([original.id]);
        const rejectedAttempt = after.find(workflow => workflow.id === attemptId);
        expect(rejectedAttempt?.status, 'Rejected attempt must remain pending').toBeNull();
        expect(rejectedAttempt?.clusterId).toBe('');
        expect(rejectedAttempt?.provisioningFileCount, 'Rejected file must not be registered').toBe(0);
        const afterInsights = await discoveryApi.insightFingerprint(original.id, () => discoveryPage.openCompletedWorkflow(original.name));
        await expect(discoveryDashboardPage.enterpriseTiles.first()).toBeVisible();
        expect(afterInsights, 'Entire registered cluster, enterprise list, matrices and workflow insights must remain unchanged').toBe(originalInsights);
        await test.info().attach('duplicate-rejection-evidence', { contentType: 'application/json', body: JSON.stringify({
          expectedHttpStatus: 400, uploadCount, creationCount, existingWorkflowCount: existing.length,
          completedCountBefore: existing.filter(workflow => workflow.status === 'Completed').length,
          completedCountAfter: after.filter(workflow => workflow.status === 'Completed').length,
          beforeInsightsSha256: originalInsights, afterInsightsSha256: afterInsights,
        }) });
      });
    } finally {
      expect.soft(violations, 'Only the dedicated pending attempt may receive a discovery write').toEqual([]);
      expect.soft(uploadCount, 'Exactly one duplicate upload is permitted').toBe(1);
      expect.soft(creationCount, 'A dedicated pending workflow is created only when absent').toBeLessThanOrEqual(1);
    }
  });
});
