import { Locator, Page } from '@playwright/test';
import {
  ChartData, DisplayedMetric, nexusMetricLabels, NexusMetric, NexusSummaryMetrics,
  NexusChartTitle, NexusTableTitle, parseDisplayedNumber, TableRow,
} from '../models/dashboard';

const tableContainers: Record<NexusTableTitle, string> = {
  'Opportunity View': '.opportunityView', 'Feature Distribution': '.feature-provisioning-section',
  'Device Model Distribution': '.device-model-distribution-table',
  'Trunk Discovery & Optimization': '.trunkDiscoveryOptimization', 'Reseller Information': '.resellerInformation',
};

export class NexusPage {
  readonly root: Locator;
  readonly summaryBoard: Locator;
  readonly deploymentType: Locator;
  readonly cluster: Locator;
  readonly applyFilter: Locator;
  readonly loading: Locator;
  readonly errors: Locator;
  readonly dialog: Locator;

  constructor(readonly page: Page) {
    this.root = page.locator('app-platform-dashboard');
    this.summaryBoard = page.getByText('Summary Board', { exact: true });
    // Inspected Angular controls have no accessible labels/test IDs; scope by their visible field label.
    this.deploymentType = this.root.locator('.instance-dropdown').filter({ has: page.getByText('Deployment Type', { exact: true }) }).getByRole('combobox');
    this.cluster = this.root.locator('.instance-dropdown').filter({ has: page.getByText('Clusters', { exact: true }) }).getByRole('combobox');
    this.applyFilter = this.root.getByRole('button', { name: 'Apply Filter', exact: true });
    this.loading = this.root.getByRole('progressbar');
    this.errors = this.root.getByRole('alert').or(page.locator('mat-snack-bar-container').filter({ hasText: /error|failed|unable/i }));
    this.dialog = page.getByRole('dialog');
  }

  async openNexus(): Promise<void> { await this.page.getByRole('radio', { name: 'Nexus', exact: true }).click(); }
  async selectDeploymentType(value: string): Promise<void> { await this.selectOption(this.deploymentType, value); }
  async selectCluster(value: string): Promise<void> { await this.selectOption(this.cluster, value); }
  async applyFilters(): Promise<void> { await this.applyFilter.click(); }

  async availableOptions(control: Locator): Promise<string[]> {
    await control.click();
    await this.page.getByRole('option').first().waitFor();
    const values = (await this.page.getByRole('option').allTextContents()).map(value => value.trim());
    await this.page.keyboard.press('Escape');
    return values;
  }

  private async selectOption(control: Locator, value: string): Promise<void> {
    await control.click();
    await this.page.getByRole('option', { name: value, exact: true }).click();
  }

  metric(key: NexusMetric): Locator {
    return this.root.locator('.summary-card').filter({ has: this.page.getByText(nexusMetricLabels[key], { exact: true }) }).locator('.card-value');
  }

  async getDisplayedMetrics(): Promise<Record<NexusMetric, DisplayedMetric>> {
    const metrics = {} as Record<NexusMetric, DisplayedMetric>;
    for (const key of Object.keys(nexusMetricLabels) as NexusMetric[]) {
      const value = (await this.metric(key).innerText()).trim();
      metrics[key] = { label: nexusMetricLabels[key], text: value, value: parseDisplayedNumber(value), unit: key === 'devicesEolPercent' ? 'percent' : 'count' };
    }
    return metrics;
  }

  async getSummaryMetrics(): Promise<NexusSummaryMetrics> {
    const displayed = await this.getDisplayedMetrics();
    return Object.fromEntries(Object.entries(displayed).map(([key, metric]) => [key, metric.value])) as NexusSummaryMetrics;
  }

  chart(title: NexusChartTitle): Locator {
    if (title === 'Top AI Upgrade Targets') return this.root.locator('.featureByCustomerSize');
    return this.root.locator('.platform-summary-chart-card').filter({ has: this.page.getByText(title, { exact: true }) });
  }

  async getChartData(title: NexusChartTitle): Promise<ChartData> {
    const chart = this.chart(title);
    const categories = await chart.locator('.apexcharts-xaxis-texts-g text, .apexcharts-yaxis-texts-g text')
      .evaluateAll(elements => elements.map(element => element.querySelector('tspan')?.textContent ?? element.textContent ?? ''));
    const series = await chart.locator('g.apexcharts-series').evaluateAll(groups => groups.map(group => ({
      name: group.getAttribute('seriesName') ?? group.getAttribute('data:realIndex') ?? '',
      values: Array.from(group.querySelectorAll('path, rect')).flatMap(element => {
        const value = element.getAttribute('val') ?? element.getAttribute('data:value');
        return value === null ? [] : [Number(value)];
      }),
    })).filter(series => series.values.length > 0));
    return { title, categories: categories.map(category => category.trim()).filter(Boolean), series,
      unit: ['EOL Exposure', 'Endpoint Adoption', 'Top AI Upgrade Targets'].includes(title) ? 'percent' : title === 'Feature Breadth Index' ? 'ratio' : 'count' };
  }

  async hoverChartPoint(title: NexusChartTitle): Promise<void> {
    const chart = this.chart(title);
    const largest = await chart.locator('.apexcharts-series [val]:visible, .apexcharts-series [data\\:value]:visible')
      .evaluateAll(elements => elements.map(element => ({
        attribute: element.hasAttribute('val') ? 'val' : 'data\\:value',
        raw: element.getAttribute('val') ?? element.getAttribute('data:value') ?? '',
      })).filter(point => Number.isFinite(Number(point.raw)) && Number(point.raw) > 0)
        .sort((a, b) => Number(b.raw) - Number(a.raw))[0]);
    if (!largest) throw new Error(`${title}: no positive rendered point is available for a tooltip`);
    // Tiny positive bars can be subpixel and fail hit testing. Choose the largest
    // scoped point, without forcing the hover or excluding small values from validation.
    const point = chart.locator(`.apexcharts-series [${largest.attribute}="${largest.raw}"]:visible`).first();
    await point.scrollIntoViewIfNeeded();
    const position = await point.evaluate(element => {
      if (!(element instanceof SVGGeometryElement)) return null;
      const bounds = element.getBBox();
      const screenBounds = element.getBoundingClientRect();
      const transform = element.getScreenCTM();
      if (!transform) return null;
      // A donut slice's bounding-box center can be inside its empty hole.
      // Find an actual filled point and confirm it receives pointer events.
      const fractions = [0.5, 0.25, 0.75, 0.1, 0.9];
      for (const x of fractions) for (const y of fractions) {
        const local = new DOMPoint(bounds.x + bounds.width * x, bounds.y + bounds.height * y);
        if (!element.isPointInFill(local)) continue;
        const screen = local.matrixTransform(transform);
        const hit = document.elementFromPoint(screen.x, screen.y);
        if (hit === element || (hit && element.contains(hit))) {
          return { x: screen.x - screenBounds.left, y: screen.y - screenBounds.top };
        }
      }
      return null;
    });
    if (!position) throw new Error(`${title}: positive SVG data has no hit-testable interior point`);
    await point.hover({ position });
  }

  async openChartDetails(title: NexusChartTitle): Promise<boolean> {
    const more = this.chart(title).getByText(/^\+?\d+\s+more$/i);
    if (!await more.count()) return false;
    await more.click();
    return true;
  }

  tableSection(title: NexusTableTitle): Locator { return this.root.locator(tableContainers[title]); }
  table(title: NexusTableTitle): Locator { return this.tableSection(title).getByRole('table'); }

  async getTableRows(table: Locator): Promise<TableRow[]> {
    return table.locator('tbody tr').evaluateAll(rows => {
      const carried: { text: string; remaining: number }[] = [];
      return rows.map(row => {
        const cells: string[] = [];
        carried.forEach((span, column) => {
          if (span.remaining > 0) { cells[column] = span.text; span.remaining--; }
        });
        // Angular leaves hidden continuation cells in the DOM alongside visible rowspans.
        const physicalCells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'))
          .filter(cell => getComputedStyle(cell).display !== 'none');
        let column = 0;
        for (const cell of physicalCells) {
          while (cells[column] !== undefined) column++;
          const value = cell.textContent?.trim() ?? '';
          for (let offset = 0; offset < cell.colSpan; offset++) {
            cells[column + offset] = value;
            if (cell.rowSpan > 1) carried[column + offset] = { text: value, remaining: cell.rowSpan - 1 };
          }
          column += cell.colSpan;
        }
        return { cells, empty: physicalCells.length === 1 && /^No (?:data|records)/i.test(physicalCells[0].textContent?.trim() ?? '') };
      });
    });
  }

  async selectTableFeatureType(title: 'Opportunity View' | 'Feature Distribution', type: 'All' | 'Group' | 'User'): Promise<void> {
    await this.tableSection(title).locator('.platform-opportunity-filter-option').filter({ hasText: new RegExp(`^\\s*${type}\\s*$`) }).click();
  }

  async openViewAll(title: NexusTableTitle): Promise<void> {
    await this.tableSection(title).getByText('View All', { exact: true }).click();
  }

  async closeDetails(): Promise<void> { await this.page.keyboard.press('Escape'); }

  async searchDetails(query: string): Promise<void> {
    await this.dialog.getByPlaceholder('Search', { exact: true }).fill(query);
  }

  async scrollDetailsToBottom(): Promise<{ scrollable: boolean; moved: boolean }> {
    return this.dialog.evaluate(dialog => {
      const candidates = [dialog, ...Array.from(dialog.querySelectorAll('*'))].filter(element =>
        element instanceof HTMLElement && element.scrollHeight > element.clientHeight &&
        /auto|scroll/.test(getComputedStyle(element).overflowY));
      let moved = false;
      for (const element of candidates) {
        const before = element.scrollTop;
        element.scrollTop = element.scrollHeight;
        moved ||= element.scrollTop > before;
      }
      return { scrollable: candidates.length > 0, moved };
    });
  }
}
