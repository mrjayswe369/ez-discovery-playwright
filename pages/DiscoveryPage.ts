
import { Page, Locator } from '@playwright/test';

export interface DiscoveryWorkflowData {
  name: string;
  sourcePlatform: string;
  targetPlatform: string;
  deploymentType: string;
  clusterId?: string;
}

export class DiscoveryPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly createWorkflowButton: Locator;
  readonly workflowDialog: Locator;
  readonly discoveryNameInput: Locator;
  readonly clusterIdDropdown: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly completedWorkflowCards: Locator;

  constructor(page: Page) {
    this.page = page;
    // Status and heading share a workflow card; status text alone is not clickable.
    this.completedWorkflowCards = page.getByText('DISCOVERY COMPLETE', { exact: true })
      .locator('xpath=ancestor::*[.//h3][1]');

    this.heading = page.getByText(
      'Discovery Landscape',
      { exact: true }
    );

    this.createWorkflowButton = page
      .getByRole('button', {
        name: /create workflow/i
      })
      .or(
        page.getByText('Initiate New Discovery', {
          exact: true
        })
      ).first();

    this.workflowDialog = page
      .getByRole('dialog')
      .filter({
        hasText: 'Create Discovery Workflow'
      });

    this.discoveryNameInput = this.workflowDialog
      .getByRole('textbox', {
        name: /discovery name/i
      });

    this.clusterIdDropdown = this.workflowDialog.locator('#discovery-wf-cluster');

    this.submitButton = this.workflowDialog
      .getByRole('button', {
        name: 'Submit',
        exact: true
      });

    this.cancelButton = this.workflowDialog
      .getByRole('button', {
        name: 'Cancel',
        exact: true
      });
  }

  async openCreateWorkflow(): Promise<void> {
    await this.createWorkflowButton.click();
  }

  private async selectDropdown(
    index: number,
    value: string
  ): Promise<void> {
    // Confirmed Angular Material controls; options render in the CDK overlay.
    const ids = ['cluster', 'source-platform', 'target-platform', 'deployment-type'];
    const dropdown = this.workflowDialog.locator(`#discovery-wf-${ids[index]}`);

    const tagName = await dropdown.evaluate(
      element => element.tagName.toLowerCase()
    );

    if (tagName === 'select') {
      await dropdown.selectOption({ label: value });
      return;
    }

    await dropdown.click();

    await this.page.getByRole('option', {
      name: value,
      exact: true
    }).click();
  }

  async fillWorkflow(
    data: DiscoveryWorkflowData
  ): Promise<void> {
    await this.discoveryNameInput.fill(data.name);

    // Cluster ID is optional for manual workflows
    if (data.clusterId) {
      await this.selectDropdown(0, data.clusterId);
    }

    await this.selectDropdown(1, data.sourcePlatform);
    await this.selectDropdown(2, data.targetPlatform);
    await this.selectDropdown(3, data.deploymentType);
  }

  async submitWorkflow(): Promise<void> {
    await this.submitButton.click();
  }

  async cancelWorkflow(): Promise<void> {
    await this.cancelButton.click();
  }

  completedWorkflowCard(name?: string): Locator {
    return name
      ? this.completedWorkflowCards.filter({ has: this.workflowName(name) }).first()
      : this.completedWorkflowCards.first();
  }

  async openCompletedWorkflow(name?: string): Promise<string> {
    const heading = this.completedWorkflowCard(name).getByRole('heading', { level: 3 });
    const fullName = await heading.getAttribute('ng-reflect-message') ?? await heading.innerText();
    await heading.click();
    return fullName.trim();
  }

  workflowName(name: string): Locator {
    return this.page.getByRole('heading', {
      name,
      exact: true
    }).or(this.page.locator(`h3[ng-reflect-message="${name.replace(/["\\]/g, '\\$&')}"]`));
  }

  workflowCard(name: string): Locator {
    return this.workflowName(name).locator(
      'xpath=ancestor::*[' +
      './/*[normalize-space(text())="DISCOVERY PENDING"]' +
      '][1]'
    );
  }

  workflowStatus(name: string): Locator {
    return this.workflowCard(name).getByText(
      'DISCOVERY PENDING',
      { exact: true }
    );
  }
}
