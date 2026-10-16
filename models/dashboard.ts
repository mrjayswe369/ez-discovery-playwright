export const nexusMetricLabels = {
  enterprises: 'Enterprises (Hosted)', users: 'Users', devices: 'Devices',
  devicesEolPercent: 'Devices EOL', churnRiskEnterprises: 'Churn Risk Enterprises',
  migrationReadyEnterprises: 'Migration Ready Enterprises', trunks: 'Trunks',
  aiOpportunityAccounts: 'AI Opportunity Accounts', aiReadyUsers: 'AI Ready Users',
  totalResellers: 'Total Resellers', aiServicesPotential: 'AI Services Potential', groups: 'Groups',
} as const;

export type NexusMetric = keyof typeof nexusMetricLabels;
export type NexusSummaryMetrics = Record<NexusMetric, number>;
export interface DisplayedMetric { label: string; text: string; value: number; unit: 'count' | 'percent' }
export interface EnterpriseSummaryMetrics {
  users: number; devices: number; devicesEol: number; sitesAndLocations: number;
  aiReadyUsers: number; groups: number;
  groupFeatures: { purchased: number; enabled: number; config: number };
  userFeatures: { purchased: number; enabled: number; config: number };
}
export interface FilterSelections { platform: string; deploymentType: string; cluster: string }
export interface ChartSeries { name: string; values: number[] }
export interface ChartData { title: string; categories: string[]; series: ChartSeries[]; unit: 'count' | 'percent' | 'ratio' }
export interface TableRow { cells: string[]; empty: boolean }
export type ComparisonResult<T = number> =
  | { status: 'PASS' | 'FAIL'; subject: string; actual: T; expected: T; evidence: string }
  | { status: 'NOT VALIDATED'; subject: string; reason: string };

export const nexusChartTitles = [
  'Enterprise Size Summary', 'EOL Exposure', 'Licensing Summary',
  'Knowledge Worker Exclusive', 'Feature Breadth Index', 'Endpoint Adoption', 'Top AI Upgrade Targets',
] as const;
export type NexusChartTitle = typeof nexusChartTitles[number];
export const nexusTableTitles = [
  'Opportunity View', 'Feature Distribution', 'Device Model Distribution',
  'Trunk Discovery & Optimization', 'Reseller Information',
] as const;
export type NexusTableTitle = typeof nexusTableTitles[number];

export function parseDisplayedNumber(text: string): number {
  const normalized = text.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?%?$/.test(normalized)) {
    throw new Error('Dashboard value is not a formatted nonnegative number');
  }
  const value = Number(normalized.replace(/[, %]/g, ''));
  if (!Number.isFinite(value)) throw new Error('Dashboard value is not finite');
  return value;
}
