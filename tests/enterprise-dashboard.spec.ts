import { test, expect } from '../fixtures/baseFixtures';
import { verifyDiscoveryAndEnterprise } from './support/dashboardAssertions';

test('DISC-002: Validate an existing discovery dashboard without changing data',
  { tag: ['@ci', '@repeatable', '@existing-dashboard', '@read-only'] }, async ({
  page, loginPage, discoveryPage, discoveryDashboardPage, enterpriseDashboardPage,
  existingWorkflowData,
}) => {
  test.setTimeout(240000);
  const workflow = existingWorkflowData.workflowName;
  const { TEST_EMAIL: email, TEST_PASSWORD: password } = process.env;
  if (!email || !password) throw new Error('QA test credentials are missing');
  const writes: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' &&
        (/\/discovery\/workflow\/create(?:\?|$)/.test(request.url()) ||
          (request.headers()['content-type'] ?? '').includes('multipart/form-data'))) {
      writes.push(new URL(request.url()).pathname);
    }
  });
  await test.step('Login and verify Discovery Landscape', async () => {
    await loginPage.goto();
    await loginPage.login(email, password);
    await expect(discoveryPage.heading).toBeVisible({ timeout: 20000 });
  });
  await test.step('Open an existing completed discovery workflow', async () => {
    const card = discoveryPage.completedWorkflowCard(workflow);
    await expect(card, workflow
      ? `Configured workflow "${workflow}" must be listed with DISCOVERY COMPLETE status`
      : 'At least one existing DISCOVERY COMPLETE workflow is required; no workflow will be created by DISC-002',
    ).toBeVisible({ timeout: 60000 });
    await expect(card.getByText('DISCOVERY COMPLETE', { exact: true })).toBeVisible();
    const selected = await discoveryPage.openCompletedWorkflow(workflow);
    await test.info().attach('existing-completed-workflow', {
      body: selected, contentType: 'text/plain',
    });
  });
  await verifyDiscoveryAndEnterprise(discoveryDashboardPage, enterpriseDashboardPage);
  await test.step('Verify DISC-002 created no workflow and uploaded no file', async () => {
    expect(writes, 'DISC-002 must not create a workflow or upload an archive').toEqual([]);
  });
});
