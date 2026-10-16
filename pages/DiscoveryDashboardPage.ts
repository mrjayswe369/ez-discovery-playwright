import { Locator, Page } from '@playwright/test';

export interface SelectedEnterprise { name: string; id: string }

export class DiscoveryDashboardPage {
  readonly enterpriseTiles: Locator;
  readonly enterpriseCount: Locator;
  constructor(readonly page: Page) {
    this.enterpriseTiles = page.locator('.enterprise-grid:visible .enterprise-card');
    this.enterpriseCount = page.locator('.ai-opportunity-card:visible')
      .filter({ has: page.getByText('Enterprises', { exact: true }) })
      .locator('.ai-opportunity-card-value');
  }

  async selectAvailableEnterprise(): Promise<SelectedEnterprise> {
    const tile = this.enterpriseTiles.first();
    const name = (await tile.locator('.enterprise-card-name').innerText()).trim();
    const id = (await tile.locator('.enterprise-card-id').innerText()).replace(/^E-ID:\s*/, '').trim();
    await tile.click();
    return { name, id };
  }
}
