import { Locator, Page } from '@playwright/test';

export class EnterpriseDashboardPage {
  readonly name: Locator;
  readonly reportType: Locator;
  readonly crmLead: Locator;
  constructor(readonly page: Page) {
    this.name = page.locator('.enterprise-name-text');
    this.reportType = page.locator('.report-type-dropdown').getByRole('combobox');
    this.crmLead = page.getByRole('button', { name: 'Create CRM Lead', exact: true });
  }

  metric(label: string): Locator {
    return this.page.locator('.summary-card').filter({
      has: this.page.getByText(label, { exact: true }),
    }).locator('.card-value');
  }

  featureMetric(section: string, label: string): Locator {
    return this.page.locator('.feature-composite-section').filter({
      has: this.page.getByText(section, { exact: true }),
    }).locator('.feature-composite-metric-cell').filter({
      has: this.page.getByText(label, { exact: true }),
    }).locator('.feature-composite-metric-value');
  }

  metadata(label: string): Locator {
    return this.page.locator('.discovery-metadata-row .item').filter({
      has: this.page.getByText(label, { exact: true }),
    }).locator('.value');
  }

  detail(label: string): Locator {
    return this.page.locator('.info-item').filter({
      has: this.page.getByText(label, { exact: true }),
    }).locator('.value');
  }

  chartCard(title: string): Locator {
    return this.page.locator('.licensing-summary-card, .knowledge-worker-license-bands-card').filter({
      has: this.page.getByText(title, { exact: true }),
    });
  }

  async openReportTypes(): Promise<void> { await this.reportType.click(); }
  async closeReportTypes(): Promise<void> { await this.page.keyboard.press('Escape'); }
}
