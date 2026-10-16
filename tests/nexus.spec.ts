import { test, expect } from '../fixtures/nexusFixtures';
import { nexusChartTitles, nexusTableTitles, ComparisonResult, NexusTableTitle, parseDisplayedNumber } from '../models/dashboard';
import { openSummaryBoard, verifyBoardReady, verifyChartsLoaded, verifyMetrics, verifyFilterScope, attachComparisons, expectedChartValues } from './support/nexusAssertions';

test.use({ trace: 'off', screenshot: 'off', video: 'off', actionTimeout: 30000 });

test.describe('Nexus Summary Board — read-only regression', { tag: ['@ci', '@repeatable', '@nexus', '@read-only'] }, () => {
  test.describe.configure({ retries: 0 });
  test.beforeEach(async ({ loginPage, discoveryPage, nexusDiagnostics }) => {
    test.setTimeout(240000);
    await test.step('Login using configured QA credentials', async () => {
      const { TEST_EMAIL: email, TEST_PASSWORD: password } = process.env;
      if (!email || !password || !process.env.BASE_URL) throw new Error('BASE_URL, TEST_EMAIL and TEST_PASSWORD are required');
      await loginPage.goto();
      await loginPage.login(email, password);
      await expect(discoveryPage.heading).toBeVisible({ timeout: 30000 });
      await nexusDiagnostics.startAfterLogin();
    });
  });
  test.afterEach(async ({ nexusDiagnostics }) => {
    await test.step('Confirm read-only execution and no uncaught application errors', async () => {
      expect.soft(nexusDiagnostics.violations, 'Nexus must not issue state-changing discovery requests').toEqual([]);
      expect.soft(nexusDiagnostics.runtimeErrors, 'No uncaught application errors should remain').toEqual([]);
    });
  });

  test('NEX-001: Navigate from Nodes to Nexus and verify default Summary Board', async ({ nexusPage, nexusApi }) => {
    const snapshot = await openSummaryBoard(nexusPage, nexusApi);
    await test.step('Verify default filters and major sections', async () => {
      await expect(nexusPage.deploymentType).toHaveText(process.env.NEXUS_DEFAULT_DEPLOYMENT ?? 'Lab');
      await expect(nexusPage.cluster).toHaveText('All');
      await expect(nexusPage.page.getByRole('radio', { name: 'Nexus', exact: true })).toBeChecked();
      for (const title of nexusChartTitles) await expect(nexusPage.chart(title)).toBeVisible();
      for (const title of nexusTableTitles) await expect(nexusPage.tableSection(title)).toBeVisible();
      await verifyFilterScope(snapshot, { deploymentType: await nexusPage.deploymentType.innerText(), cluster: 'all' });
    });
  });

  test('NEX-002: Validate all 12 KPI formats and UI/API aggregate accuracy', async ({ nexusPage, nexusApi }) => {
    const snapshot = await openSummaryBoard(nexusPage, nexusApi);
    await verifyMetrics(nexusPage, snapshot);
  });

  test('NEX-003: Apply every available deployment type and verify scoped data', async ({ nexusPage, nexusApi }) => {
    await openSummaryBoard(nexusPage, nexusApi);
    const deployments = await nexusPage.availableOptions(nexusPage.deploymentType);
    expect(deployments.length, 'At least one supported deployment must be available').toBeGreaterThan(0);
    for (const deployment of deployments) {
      await test.step(`Apply ${deployment} deployment and validate its API scope`, async () => {
        await nexusPage.selectDeploymentType(deployment);
        await nexusPage.selectCluster('All');
        const snapshot = await nexusApi.capture(() => nexusPage.applyFilters());
        await verifyBoardReady(nexusPage);
        await expect(nexusPage.deploymentType).toHaveText(deployment);
        await verifyFilterScope(snapshot, { deploymentType: deployment, cluster: 'all' });
        await verifyMetrics(nexusPage, snapshot);
        await verifyChartsLoaded(nexusPage);
      });
    }
    await attachComparisons('deployment-availability', ['Lab', 'Prod'].filter(value => !deployments.includes(value)).map(value => ({
      status: 'NOT VALIDATED' as const, subject: `${value} deployment`, reason: 'Not offered by the current environment; no configuration or test data was changed.',
    })));
  });

  test('NEX-004: Select a dynamic cluster, validate scoped KPIs, and restore All', async ({ nexusPage, nexusApi }) => {
    await openSummaryBoard(nexusPage, nexusApi);
    const clusters = (await nexusPage.availableOptions(nexusPage.cluster)).filter(value => value !== 'All');
    expect(clusters.length, 'An existing cluster is required for scoped-filter validation').toBeGreaterThan(0);
    await test.step('Apply an available cluster', async () => {
      await nexusPage.selectCluster(clusters[0]);
      const snapshot = await nexusApi.capture(() => nexusPage.applyFilters());
      await verifyBoardReady(nexusPage);
      await expect(nexusPage.cluster).toHaveText(clusters[0]);
      await verifyFilterScope(snapshot, { deploymentType: await nexusPage.deploymentType.innerText(), cluster: clusters[0] });
      await verifyMetrics(nexusPage, snapshot);
    });
    await test.step('Restore All clusters and verify the unfiltered scope', async () => {
      await nexusPage.selectCluster('All');
      const snapshot = await nexusApi.capture(() => nexusPage.applyFilters());
      await expect(nexusPage.cluster).toHaveText('All');
      await verifyBoardReady(nexusPage);
      await verifyFilterScope(snapshot, { deploymentType: await nexusPage.deploymentType.innerText(), cluster: 'all' });
      await verifyMetrics(nexusPage, snapshot);
    });
  });

  test('NEX-005: Validate seven charts, series values, categories, legends and tooltips', async ({ nexusPage, nexusApi }) => {
    const snapshot = await openSummaryBoard(nexusPage, nexusApi);
    const comparisons: ComparisonResult<unknown>[] = [];
    for (const title of nexusChartTitles) {
      await test.step(`Validate ${title}`, async () => {
        const card = nexusPage.chart(title);
        await expect(card).toBeVisible();
        await card.scrollIntoViewIfNeeded();
        let expected = expectedChartValues(title, snapshot);
        const empty = card.getByText(/^(?:No data to display|No data available)$/i);
        if (await empty.count()) {
          await expect(empty.first()).toBeVisible();
          expect(expected?.every(value => value === 0) ?? snapshot.licenseCombinations.totalClassified === 0, `${title} empty state must agree with source evidence`).toBe(true);
          return;
        }
        await expect(card.locator('svg.apexcharts-svg').first()).toBeVisible({ timeout: 30000 });
        await expect.poll(async () => (await nexusPage.getChartData(title)).series.length, { message: `${title} must contain numeric series` }).toBeGreaterThan(0);
        const chart = await nexusPage.getChartData(title);
        if (title === 'EOL Exposure') {
          // The inspected client shows the largest vendors first and caps the preview.
          expected = [...snapshot.eolSeries].sort((a, b) => b.percentages.reduce((sum, value) => sum + value, 0) - a.percentages.reduce((sum, value) => sum + value, 0))
            .slice(0, chart.series.length - 1).flatMap(series => series.percentages);
          expected.push(...snapshot.enterpriseCategories.map(() => 0)); // Transparent dummy series inspected in initializeChart.
        }
        const values = chart.series.flatMap(series => series.values);
        for (const value of values) {
          expect(Number.isFinite(value), `${title} contains only finite values`).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          if (chart.unit === 'percent') expect(value).toBeLessThanOrEqual(100);
        }
        const legend = card.locator('.apexcharts-legend-text, .licensing-summary-donut__legend-text');
        if (title !== 'Knowledge Worker Exclusive' && title !== 'Feature Breadth Index' && title !== 'Top AI Upgrade Targets') {
          expect(await legend.count(), `${title} must have a legend`).toBeGreaterThan(0);
        } else {
          expect(chart.categories.length, `${title} must label its categories`).toBeGreaterThan(0);
        }
        if (title === 'Enterprise Size Summary') {
          expect(chart.series.map(series => series.name)).toEqual(snapshot.enterpriseCategories.map(category => category.category));
        }
        if (['EOL Exposure', 'Feature Breadth Index', 'Endpoint Adoption', 'Top AI Upgrade Targets'].includes(title)) {
          const sourceCategories = snapshot.enterpriseCategories.map(category => category.category);
          const displayedCategories = [...new Set(chart.categories.filter(category => sourceCategories.includes(category)))];
          expect(displayedCategories, `${title} category order must match the API scope`).toEqual(sourceCategories);
        }
        if (title === 'Licensing Summary') {
          const center = card.locator('.licensing-summary-donut__center-total-value');
          await expect(center).toBeVisible();
          const actual = parseDisplayedNumber(await center.innerText());
          const total = snapshot.licenseCombinations.totalClassified;
          comparisons.push({ subject: 'Licensing center / API classified total', actual, expected: total,
            status: actual === total ? 'PASS' : 'FAIL', evidence: 'The licensing total field, not a claim about total users or overlapping slices' });
          for (const label of await card.locator('.licensing-summary-donut__legend-text').allTextContents()) {
            const percentage = label.match(/(\d+(?:\.\d+)?)%/);
            expect(percentage, 'Licensing legend must expose a percentage').not.toBeNull();
            expect(Number(percentage![1])).toBeGreaterThanOrEqual(0);
            expect(Number(percentage![1])).toBeLessThanOrEqual(100);
          }
        }
        if (title === 'Top AI Upgrade Targets') {
          expect(chart.series.length, 'Every API AI feature must have a heatmap series').toBe(snapshot.aiTargets.length);
          for (const target of snapshot.aiTargets) {
            const encodedName = target.feature.replace(/([a-z0-9])([A-Z])/g, '$1x$2').toLowerCase();
            const series = chart.series.find(candidate => candidate.name.toLowerCase() === encodedName);
            expect(Boolean(series), 'Heatmap must identify each API feature by name').toBe(true);
            comparisons.push({ subject: `AI heatmap ${target.feature}`, actual: series!.values, expected: target.percentages,
              status: JSON.stringify(series!.values) === JSON.stringify(target.percentages) ? 'PASS' : 'FAIL', evidence: 'Feature identity and ordered API category percentages' });
          }
        } else if (expected) comparisons.push({ subject: `${title} series`, actual: values, expected,
          status: JSON.stringify(values) === JSON.stringify(expected) ? 'PASS' : 'FAIL', evidence: 'Ordered SVG series/category values against scoped API aggregates and inspected renderer mapping' });
        else comparisons.push({ status: 'NOT VALIDATED', subject: `${title} slice sizes`, reason: 'The licensing donut applies minimum visual slice sizes; raw counts are not SVG areas.' });
        if (values.some(value => value > 0)) {
          await nexusPage.hoverChartPoint(title);
          await expect(card.locator('.apexcharts-tooltip.apexcharts-active').first(), `${title} tooltip`).toBeVisible();
        } else {
          comparisons.push({ status: 'NOT VALIDATED', subject: `${title} tooltip`, reason: 'All scoped data values are zero; no positive bar or slice is available to hover.' });
        }
        if (await nexusPage.openChartDetails(title)) {
          await expect(nexusPage.dialog).toBeVisible();
          await nexusPage.closeDetails();
          await expect(nexusPage.dialog).toHaveCount(0);
        }
      });
    }
    await attachComparisons('chart-api-comparisons', comparisons);
  });

  test('NEX-006: Validate five tables, Group/User filters, View All and scrolling', async ({ nexusPage, nexusApi }) => {
    const snapshot = await openSummaryBoard(nexusPage, nexusApi);
    for (const title of nexusTableTitles) {
      await test.step(`Validate ${title} table and View All`, async () => {
        const section = nexusPage.tableSection(title);
        await expect(section).toBeVisible();
        await verifyTable(nexusPage, nexusPage.table(title), title, title === 'Reseller Information' && snapshot.resellerRowCount === 0);
        if (await section.getByText('View All', { exact: true }).count()) {
          const inlineCount = (await nexusPage.getTableRows(nexusPage.table(title))).length;
          await nexusPage.openViewAll(title);
          await expect(nexusPage.dialog).toBeVisible();
          await verifyTable(nexusPage, nexusPage.dialog.getByRole('table'), title);
          const rows = nexusPage.dialog.getByRole('table').locator('tbody tr');
          expect(await rows.count(), `${title} full view must include at least its preview rows`).toBeGreaterThanOrEqual(inlineCount);
          const beforeScroll = await rows.count();
          const scroll = await nexusPage.scrollDetailsToBottom();
          if (scroll.scrollable) expect(scroll.moved, `${title} scrollable details must move`).toBe(true);
          await expect.poll(() => rows.count(), { message: `${title} scroll must retain or extend loaded rows` }).toBeGreaterThanOrEqual(beforeScroll);
          const search = nexusPage.dialog.getByPlaceholder('Search', { exact: true });
          await expect(search).toBeVisible();
          const visibleRows = await nexusPage.getTableRows(nexusPage.dialog.getByRole('table'));
          const query = visibleRows.find(row => !row.empty)?.cells.find(value => value.trim().length > 0);
          if (!query) throw new Error(`${title}: no populated row available for search validation`);
          await nexusPage.searchDetails(query);
          await expect(nexusPage.dialog.getByRole('progressbar')).toHaveCount(0, { timeout: 30000 });
          await expect.poll(async () => {
            const matches = (await nexusPage.getTableRows(nexusPage.dialog.getByRole('table'))).filter(row => !row.empty);
            return matches.length > 0 && matches.every(row => row.cells.some(cell => cell.toLowerCase().includes(query.toLowerCase())));
          }, { message: `${title} search must return matching populated rows` }).toBe(true);
          await nexusPage.searchDetails('');
          await expect.poll(() => rows.count(), { message: `${title} clearing search restores preview rows` }).toBeGreaterThanOrEqual(inlineCount);
          await nexusPage.closeDetails();
          await expect(nexusPage.dialog).toHaveCount(0);
        } else {
          test.info().annotations.push({ type: 'availability', description: `${title}: View All not offered for the current data.` });
        }
      });
    }
    for (const title of ['Opportunity View', 'Feature Distribution'] as const) {
      for (const type of ['Group', 'User'] as const) {
        await test.step(`${title}: select ${type}`, async () => {
          await nexusPage.selectTableFeatureType(title, type);
          await expect(nexusPage.tableSection(title).locator('.platform-opportunity-filter-option.active')).toHaveText(type);
          await verifyTable(nexusPage, nexusPage.table(title), title);
          if (title === 'Opportunity View') await expect(nexusPage.table(title).getByRole('columnheader', { name: '#Users', exact: true })).toHaveCount(type === 'Group' ? 0 : 1);
        });
      }
    }
    const gaps: ComparisonResult[] = [{ status: 'NOT VALIDATED', subject: 'Provisioning-to-table row accuracy', reason: 'Headers, numeric values, filters, search and expanded rows are functionally checked; independent provisioning record mappings are not implemented.' }];
    if (snapshot.resellerRowCount === 0) gaps.push({ status: 'NOT VALIDATED', subject: 'Populated reseller rows and View All', reason: 'The scoped API has zero resellers. Its explicit empty state is validated; populated interactions require existing reseller data.' });
    await attachComparisons('table-accuracy-boundary', gaps);
  });

  test('NEX-007: Validate defensible cross-component totals and scope consistency', { tag: '@consistency' }, async ({ nexusPage, nexusApi }) => {
    const snapshot = await openSummaryBoard(nexusPage, nexusApi);
    const metrics = await verifyMetrics(nexusPage, snapshot);
    const pairs: [string, number, number][] = [
      ['Enterprise size partitions / hosted enterprises', snapshot.enterpriseCategories.reduce((sum, row) => sum + row.count, 0), metrics.enterprises],
      ['Device matrix row totals / devices', snapshot.deviceRowTotals.reduce((sum, count) => sum + count, 0), metrics.devices],
      ['Device matrix scoped total / devices', snapshot.deviceMatrixTotal, metrics.devices],
      ['Trunk row counts / trunks', snapshot.trunkRowCounts.reduce((sum, count) => sum + count, 0), metrics.trunks],
      ['Reseller rows / total resellers', snapshot.resellerRowCount, metrics.totalResellers],
    ];
    await attachComparisons('cross-component-consistency', [
      ...pairs.map(([subject, actual, expected]) => ({ subject, actual, expected, status: actual === expected ? 'PASS' as const : 'FAIL' as const, evidence: 'Same captured API filter scope; aggregate rows partition the named total' })),
      { status: 'NOT VALIDATED', subject: 'Licensing total / user total', reason: 'The licensing model and treatment of overlapping/invalid combinations are not independently documented. Equality is not assumed.' },
    ]);
    await nexusPage.chart('Enterprise Size Summary').scrollIntoViewIfNeeded();
    await expect.poll(async () => (await nexusPage.getChartData('Enterprise Size Summary')).series.length).toBeGreaterThan(0);
    const chartTotal = (await nexusPage.getChartData('Enterprise Size Summary')).series.flatMap(series => series.values).reduce((a, b) => a + b, 0);
    expect(chartTotal, 'Rendered mutually exclusive enterprise-size slices must sum to hosted enterprises').toBe(metrics.enterprises);
    await verifyFilterScope(snapshot, { deploymentType: await nexusPage.deploymentType.innerText(), cluster: 'all' });
  });
});

async function verifyTable(page: import('../pages/NexusPage').NexusPage, table: import('@playwright/test').Locator, title: NexusTableTitle, expectedEmpty = false): Promise<void> {
  await expect(table).toBeVisible();
  const headers = (await table.getByRole('columnheader').allTextContents()).map(value => value.trim());
  const required: Record<NexusTableTitle, string[]> = {
    'Opportunity View': ['Instance Name', 'Enterprise', 'Enterprise Size', 'Current Feature', 'AI Equivalent', '#Groups'],
    'Feature Distribution': ['Feature Name'], 'Device Model Distribution': ['Vendor', 'Device Model'],
    'Trunk Discovery & Optimization': ['Instance Name', 'Enterprise', 'Total Trunks', 'Total Trunk Users', 'User Agent'],
    'Reseller Information': ['Reseller Name', 'Number of Enterprises'],
  };
  for (const header of required[title]) expect(headers, `${title} required header`).toContain(header);
  if (title === 'Feature Distribution' || title === 'Device Model Distribution') {
    for (const category of ['SOHO', 'MICRO', 'SMALL', 'MEDIUM', 'LARGE']) expect(headers.some(header => header.startsWith(category))).toBe(true);
  }
  const rows = table.locator('tbody tr');
  if (expectedEmpty) {
    await expect(rows, `${title} API returned no records`).toHaveCount(0);
    await expect(page.tableSection(title).getByText(/No (?:records|data)/i), `${title} must explicitly explain its empty state`).toBeVisible();
    return;
  }
  await expect(rows.first(), `${title} must render rows or its empty-state row`).toBeVisible();
  expect(await rows.count(), `${title} must show rows or an explicit empty state`).toBeGreaterThan(0);
  for (const row of await page.getTableRows(table)) {
    const cells = row.cells;
    if (row.empty) continue;
    expect(cells.length, `${title} row width must match its headers`).toBe(headers.length);
    for (let index = 0; index < cells.length; index++) {
      const value = cells[index].trim();
      const numericColumn = /#Groups|#Users|Total Trunks|Total Trunk Users|Number of Enterprises|SOHO|MICRO|SMALL|MEDIUM|LARGE/.test(headers[index]);
      if (numericColumn) {
        // Group distributions are counts; User distributions are ratios. Values >100 are not automatically invalid.
        expect(/^(?:<\s*1|(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?%?)$/.test(value), `${title} numeric column ${headers[index]} must contain a nonnegative value or <1`).toBe(true);
        if (!value.startsWith('<')) {
          const number = parseDisplayedNumber(value);
          expect(Number.isFinite(number)).toBe(true);
          if (/^#|^Total |^Number of/.test(headers[index])) expect(Number.isInteger(number), `${title} count column must be integral`).toBe(true);
        }
      } else {
        if (headers[index] !== 'User Agent') expect(value.length, `${title} required text cell must not be empty`).toBeGreaterThan(0);
        expect(/^(?:NaN|undefined|null)$/i.test(value), `${title} text cell must not contain an invalid placeholder`).toBe(false);
      }
    }
  }
}
