
import { test, expect } from '../fixtures/baseFixtures';
import { verifyDiscoveryAndEnterprise } from './support/dashboardAssertions';
import { requireDiscoveryData } from './support/discoveryPrerequisites';

test.describe('EZ Discovery - Workflow through enterprise dashboard', { tag: ['@fresh-data', '@stateful'] }, () => {
  test.describe.configure({ retries: 0 });

  test('DISC-001: Create without Cluster ID, upload discovery and validate enterprise', async ({
    loginPage,
    discoveryApi,
    freshDiscoveryData,
    discoveryPage,
    discoveryFile,
    discoveryUploadPage,
    discoveryDashboardPage,
    enterpriseDashboardPage
  }) => {

    test.setTimeout(420000);

    const email = process.env.TEST_EMAIL;
    const password = process.env.TEST_PASSWORD;

    if (!email || !password) {
      throw new Error('QA test credentials are missing');
    }

    // Short unique name to avoid UI truncation
    const workflowName =
      `Auto_${Date.now().toString(36).slice(-7)}`;

    await test.step('Login to EZ Discovery', async () => {
      await loginPage.goto();
      const workflows = await discoveryApi.workflows(() => loginPage.login(email, password));
      requireDiscoveryData(!workflows.some(workflow => workflow.clusterId === freshDiscoveryData.clusterId),
        'The configured fresh cluster already has a workflow. Supply approved unused-cluster data; no new workflow was created.');
    });

    await test.step('Verify Discovery Landscape', async () => {
      await expect(
        discoveryPage.heading
      ).toBeVisible({ timeout: 20000 });
    });

    await test.step('Open Create Discovery Workflow', async () => {
      await discoveryPage.openCreateWorkflow();

      await expect(
        discoveryPage.workflowDialog
      ).toBeVisible();
    });

    await test.step('Fill Discovery workflow details', async () => {
      await discoveryPage.fillWorkflow({
        name: workflowName,
        sourcePlatform: 'Broadworks',
        targetPlatform: 'Cisco - Webex',
        deploymentType: 'Lab'
      });
    });

    await test.step('Verify Cluster ID is optional', async () => {
      await expect(
        discoveryPage.clusterIdDropdown
      ).toHaveText('');
    });

    await test.step('Submit Discovery workflow', async () => {
      await expect(
        discoveryPage.submitButton
      ).toBeEnabled();

      await discoveryPage.submitWorkflow();

      await expect(
        discoveryPage.workflowDialog
      ).toBeHidden({ timeout: 20000 });
    });

    await test.step('Verify newly created workflow', async () => {

      // Find the newly created workflow by short name
      const workflowHeading = discoveryPage.workflowName(workflowName);

      await expect(
        workflowHeading
      ).toBeVisible({ timeout: 30000 });

      const card = discoveryPage.workflowCard(workflowName);

      await expect(
        card.getByText('DISCOVERY PENDING', { exact: true })
      ).toBeVisible();

      await expect(
        card.getByText('Source : Broadworks')
      ).toBeVisible();

      await expect(
        card.getByText('Target : Cisco - Webex')
      ).toBeVisible();

      await expect(
        card.getByText('Deployment Type : Lab')
      ).toBeVisible();

      await expect(
        card.getByText('Mode : Manual')
      ).toBeVisible();

      console.log(
        `Workflow created successfully: ${workflowName}`
      );
    });
    await test.step('Open newly created workflow upload screen', async () => {
      await discoveryPage.workflowName(workflowName).click();
      await expect(discoveryUploadPage.fileInput).toBeAttached({ timeout: 30000 });
      await expect(discoveryUploadPage.uploadButton).toBeVisible();
    });
    await test.step('Upload approved fresh-cluster GZIP and verify backend acceptance', async () => {
      await discoveryUploadPage.upload(discoveryFile);
    });
    await test.step('Wait for processing and continue to discovery dashboard', async () => {
      await discoveryUploadPage.continueToDashboard();
      await expect(discoveryUploadPage.fileInput).not.toBeVisible();
    });
    await verifyDiscoveryAndEnterprise(discoveryDashboardPage, enterpriseDashboardPage, {
      source: 'Broadworks', target: 'Cisco - Webex',
    });
  });
});
