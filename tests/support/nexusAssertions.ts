import { expect, test } from '../../fixtures/nexusFixtures';
import { NexusPage } from '../../pages/NexusPage';
import { NexusApiEvidence, NexusApiSnapshot } from '../../api/NexusApiEvidence';
import { ChartData, ComparisonResult, FilterSelections, nexusChartTitles, nexusMetricLabels, NexusMetric, NexusSummaryMetrics } from '../../models/dashboard';

export async function openSummaryBoard(page: NexusPage, api: NexusApiEvidence): Promise<NexusApiSnapshot> {
  return test.step('Open Nexus Summary Board and capture its aggregate responses', async () => {
    const snapshot = await api.capture(() => page.openNexus());
    await verifyBoardReady(page);
    return snapshot;
  });
}

export async function verifyBoardReady(page: NexusPage): Promise<void> {
  await expect(page.summaryBoard).toBeVisible();
  await expect(page.metric('enterprises')).toBeVisible({ timeout: 30000 });
  await expect(page.loading).toHaveCount(0);
  await expect(page.errors).toHaveCount(0);
}

export async function verifyChartsLoaded(page: NexusPage): Promise<void> {
  for (const title of nexusChartTitles) {
    const chart = page.chart(title);
    await expect(chart).toBeVisible();
    await expect(chart.locator('svg.apexcharts-svg').first().or(chart.getByText(/^(?:No data to display|No data available)$/i).first()).first(),
      `${title} must render a chart or an explicit empty state after filtering`).toBeVisible({ timeout: 30000 });
  }
}

export async function verifyMetrics(page: NexusPage, snapshot: NexusApiSnapshot): Promise<NexusSummaryMetrics> {
  return test.step('Validate all 12 KPI displays and independently compare UI values with API aggregates', async () => {
    const displayed = await page.getDisplayedMetrics();
    const actual = await page.getSummaryMetrics();
    const results: ComparisonResult[] = [];
    for (const key of Object.keys(nexusMetricLabels) as NexusMetric[]) {
      const metric = displayed[key];
      await expect(page.metric(key), `${metric.label} must be displayed`).toBeVisible();
      expect(Number.isFinite(metric.value), `${metric.label} must be finite`).toBe(true);
      expect(metric.value, `${metric.label} must be nonnegative`).toBeGreaterThanOrEqual(0);
      if (metric.unit === 'percent') {
        expect(metric.text.endsWith('%'), `${metric.label} is an observed percentage, not a count`).toBe(true);
        expect(metric.value).toBeLessThanOrEqual(100);
      } else {
        expect(metric.text.includes('%'), `${metric.label} is a count`).toBe(false);
        expect(Number.isInteger(metric.value), `${metric.label} must be an integer`).toBe(true);
      }
      results.push({ subject: metric.label, actual: actual[key], expected: snapshot.expectedMetrics[key],
        status: actual[key] === snapshot.expectedMetrics[key] ? 'PASS' : 'FAIL', evidence: 'UI/API presentation agreement using captured aggregate responses; not provisioning-source accuracy' });
    }
    results.push({ status: 'NOT VALIDATED', subject: 'Provisioning-source accuracy', reason: 'No archive was opened or mapped. API agreement does not independently establish source-data accuracy.' });
    results.push({ status: 'NOT VALIDATED', subject: 'Churn/migration business thresholds', reason: '>=30 and >=50 match observed client code; independent product-policy confirmation is unavailable.' });
    await attachComparisons('nexus-kpi-comparisons', results);
    return actual;
  });
}

export async function attachComparisons<T>(name: string, comparisons: ComparisonResult<T>[]): Promise<void> {
  await test.info().attach(name, { body: JSON.stringify(comparisons, null, 2), contentType: 'application/json' });
  for (const comparison of comparisons) {
    if (comparison.status === 'NOT VALIDATED') {
      test.info().annotations.push({ type: 'NOT VALIDATED', description: `${comparison.subject}: ${comparison.reason}` });
    } else {
      expect.soft(comparison.status, `${comparison.subject}: ${comparison.evidence}`).toBe('PASS');
    }
  }
}

export async function verifyFilterScope(snapshot: NexusApiSnapshot, selection: Omit<FilterSelections, 'platform'>): Promise<void> {
  await test.step('Verify every aggregate request uses the selected deployment and cluster', async () => {
    expect(snapshot.requests.length).toBeGreaterThan(0);
    const platform = snapshot.requests[0].platform;
    for (const request of snapshot.requests) {
      expect(request.platform === platform, 'Aggregate requests must use the same platform scope').toBe(true);
      expect(request.deploymentType === selection.deploymentType.toLowerCase(), 'Deployment filter must match API scope').toBe(true);
      expect(request.cluster === selection.cluster.toLowerCase() || request.cluster === selection.cluster, 'Cluster filter must match API scope').toBe(true);
    }
  });
}

export function expectedChartValues(title: ChartData['title'], snapshot: NexusApiSnapshot): number[] | undefined {
  switch (title) {
    case 'Enterprise Size Summary': return snapshot.enterpriseCategories.map(category => category.count);
    case 'EOL Exposure': return [...snapshot.eolSeries.flatMap(series => series.percentages), ...snapshot.enterpriseCategories.map(() => 0)];
    case 'Knowledge Worker Exclusive': return ['LOW', 'MEDIUM', 'HIGH', 'APPROPRIATE'].map(key => snapshot.knowledgeWorkerBands[key]);
    // Observed getChartSeries creates a one-hot series per category plus a transparent placeholder.
    case 'Feature Breadth Index': return [
      ...snapshot.featureBreadth.flatMap((category, index) => snapshot.featureBreadth.map((_, column) => column === index ? Math.round(category.average) : 0)),
      ...snapshot.featureBreadth.map(() => 0),
    ];
    // Observed convertToPercentageData rounds each stacked segment and adds a zero placeholder series.
    case 'Endpoint Adoption': return [
      ...['softClientCount', 'deskPhoneCount'].flatMap(key => snapshot.endpointCategories.map(category => {
        const total = category.softClientCount + category.deskPhoneCount;
        const value = key === 'softClientCount' ? category.softClientCount : category.deskPhoneCount;
        return total === 0 ? 0 : Math.round(value / total * 100);
      })), ...snapshot.endpointCategories.map(() => 0),
    ];
    case 'Top AI Upgrade Targets': return snapshot.aiTargets.flatMap(feature => feature.percentages);
    default: return undefined; // Licensing uses a minimum visual slice size; do not compare its SVG areas to raw license counts.
  }
}
