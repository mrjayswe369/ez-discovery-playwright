import { expect, test } from '../../fixtures/baseFixtures';
import { DiscoveryDashboardPage } from '../../pages/DiscoveryDashboardPage';
import { EnterpriseDashboardPage } from '../../pages/EnterpriseDashboardPage';

export async function nonnegativeMetric(locator: import('@playwright/test').Locator): Promise<number> {
  await expect.soft(locator).toBeVisible();
  if (!await locator.isVisible()) return Number.NaN;
  await expect.soft(locator).toHaveText(/^\s*(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?\s*$/);
  const value = Number((await locator.innerText()).replace(/,/g, ''));
  expect.soft(Number.isFinite(value)).toBe(true);
  expect.soft(value).toBeGreaterThanOrEqual(0);
  return value;
}

export async function verifyDiscoveryAndEnterprise(
  discovery: DiscoveryDashboardPage, enterprise: EnterpriseDashboardPage,
  platforms?: { source: string; target: string },
): Promise<void> {
  await test.step('Verify discovery processing completed and enterprise tiles loaded', async () => {
    await expect(discovery.enterpriseTiles.first()).toBeVisible({ timeout: 180000 });
    // Compare the count and tiles within the currently active filter.
    if (await discovery.enterpriseCount.count()) {
      const count = await nonnegativeMetric(discovery.enterpriseCount);
      const renderedCount = await discovery.enterpriseTiles.count();
      expect(count).toBeGreaterThan(0);
      expect(renderedCount).toBeLessThanOrEqual(count);
      if (renderedCount < count) {
        test.info().annotations.push({ type: 'partial-list', description: `${renderedCount} rendered tiles of ${count} total enterprises; total is not the current DOM tile count.` });
      }
    } else {
      test.info().annotations.push({ type: 'availability', description: 'Enterprise count is not exposed on this tab; tile presence verified.' });
    }
  });

  const selected = await test.step('Select an available enterprise and verify identity', async () => {
    const selected = await discovery.selectAvailableEnterprise();
    expect(selected.name).not.toBe('');
    expect(selected.id).not.toBe('');
    await expect(enterprise.name).toHaveText(selected.name, { timeout: 30000 });
    await expect(enterprise.detail('Business Name:')).toHaveText(selected.name);
    await test.info().attach('selected-enterprise', { body: JSON.stringify(selected), contentType: 'application/json' });
    // Current dashboard displays the name; E-ID is exposed on the selecting tile.
    test.info().annotations.push({ type: 'availability', description: `Enterprise ID validated on tile: ${selected.id}; dashboard has no E-ID field.` });
    return selected;
  });

  await test.step(`Verify platforms and metrics for ${selected.name}`, async () => {
    for (const [label, expected] of [['Source:', platforms?.source], ['Target:', platforms?.target]]) {
      const value = enterprise.metadata(label!);
      await expect(value).toBeVisible();
      if (expected) await expect(value).toHaveText(expected);
      else await expect(value).not.toHaveText(/^\s*(?:Unknown|N\/A)?\s*$/i);
    }
    for (const label of ['Users', 'Devices', 'Devices EOL', 'Sites & Location', 'AI Ready Users', 'Groups']) {
      await nonnegativeMetric(enterprise.metric(label));
    }
    for (const section of ['Group Features', 'User Features']) {
      for (const label of ['Purchased', 'Enabled', 'Config']) {
        await nonnegativeMetric(enterprise.featureMetric(section, label));
      }
    }
    const users = await nonnegativeMetric(enterprise.detail('Total Users:'));
    const devices = await nonnegativeMetric(enterprise.detail('Total Devices:'));
    expect(await nonnegativeMetric(enterprise.metric('Users'))).toBe(users);
    expect(await nonnegativeMetric(enterprise.metric('Devices'))).toBe(devices);
  });

  await test.step('Verify enterprise details, migration, churn and AI insights', async () => {
    for (const title of ['Enterprise Details', 'Migration Readiness', 'Churn Risk', 'AI Upgrade Opportunities']) {
      await expect(enterprise.page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
    for (const label of ['Readiness Score:', 'Risk Level:', 'Potential AI Upgrades:']) {
      await expect(enterprise.detail(label)).toBeVisible();
      await expect(enterprise.detail(label)).not.toHaveText(/^\s*$/);
    }
  });

  await test.step('Verify licensing charts and meaningful data or explicit empty state', async () => {
    for (const title of ['Licensing Summary', 'Knowledge Worker Exclusive']) {
      const card = enterprise.chartCard(title);
      await expect(card).toBeVisible();
      const empty = card.getByText('No data to display', { exact: true });
      if (await empty.isVisible()) {
        test.info().annotations.push({ type: 'chart-no-data', description: `${title}: explicit no-data state` });
        continue;
      }
      await expect(card.locator('svg.apexcharts-svg')).toBeVisible({ timeout: 30000 });
      // Zero-valued bars have zero height. Validate an available visible series.
      await expect(card.locator('.apexcharts-series path[d]:visible').first()).toBeVisible();
      const seriesPaths = await card.locator('.apexcharts-series path[d]').evaluateAll(elements =>
        elements.map(element => element.getAttribute('d') ?? ''));
      expect(seriesPaths.some(path => path.length > 0)).toBe(true);
      const dataValues = await card.locator('.apexcharts-series path[val]').evaluateAll(elements =>
        elements.map(element => Number(element.getAttribute('val'))));
      for (const value of dataValues) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      if (title === 'Licensing Summary') {
        await nonnegativeMetric(card.locator('.licensing-summary-donut__center-total-value'));
        const legend = card.locator('.licensing-summary-donut__legend-text');
        expect(await legend.count()).toBeGreaterThan(0);
        const percentages = (await legend.allTextContents()).map(text => {
          const match = text.match(/([\d.]+)%/);
          expect(match, `Percentage missing from chart legend: ${text}`).not.toBeNull();
          const value = Number(match![1]);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(100);
          return value;
        });
        expect(Math.abs(percentages.reduce((a, b) => a + b, 0) - 100)).toBeLessThanOrEqual(1);
      }
    }
  });

  await test.step('Verify Report Type options and Create CRM Lead control', async () => {
    await expect(enterprise.crmLead).toBeVisible();
    await expect(enterprise.crmLead).toBeEnabled();
    await expect(enterprise.reportType).toBeVisible();
    await expect(enterprise.reportType).toBeEnabled();
    await enterprise.openReportTypes();
    await expect(enterprise.page.getByRole('option').first()).toBeVisible();
    expect(await enterprise.page.getByRole('option').count()).toBeGreaterThan(0);
    await enterprise.closeReportTypes();
  });
}
