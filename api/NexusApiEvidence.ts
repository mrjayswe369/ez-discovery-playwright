import { Page, Response } from '@playwright/test';
import { FilterSelections, NexusSummaryMetrics } from '../models/dashboard';

const prefix = '/discovery/workflow/platform-summary/';
const endpoints = {
  summary: `${prefix}summary-cards`, devices: `${prefix}device-charts`,
  features: `${prefix}feature-charts`, enterprises: `${prefix}enterprise-category`,
  licenses: `${prefix}license-insights`, resellers: `${prefix}reseller-insights`,
  trunks: `${prefix}trunk-insights`, churn: `${prefix}churn-risk-enterprises`,
  migration: `${prefix}migration-ready-enterprises`,
  opportunities: '/discovery/workflow/ai-oppurtunity-summary',
  aiFeatures: '/discovery/workflow/ai-oppurtunity-features',
} as const;

export function object(value: unknown, subject: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${subject}: expected an object`);
  return value as Record<string, unknown>;
}
export function numeric(value: unknown, subject: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${subject}: expected a finite nonnegative number`);
  return value;
}
export function array(value: unknown, subject: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${subject}: expected an array`);
  return value;
}
export function text(value: unknown, subject: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${subject}: expected a nonempty string`);
  return value;
}

export interface EnterpriseCategory { category: string; count: number; totalUsers: number }
export interface EndpointCategory {
  category: string; deskPhoneCount: number; softClientCount: number; totalDevices: number;
  deskPhonePercentage: number; softClientPercentage: number;
}
export interface NexusApiSnapshot {
  requests: FilterSelections[];
  expectedMetrics: NexusSummaryMetrics;
  enterpriseCategories: EnterpriseCategory[];
  deviceMatrixTotal: number;
  deviceRowTotals: number[];
  endpointCategories: EndpointCategory[];
  licenseCombinations: Record<string, number>;
  knowledgeWorkerBands: Record<string, number>;
  featureBreadth: { category: string; average: number }[];
  eolSeries: { vendor: string; percentages: number[] }[];
  aiTargets: { feature: string; percentages: number[] }[];
  trunkRowCounts: number[];
  resellerRowCount: number;
}

/** Captures only the observed read-only aggregate contract, never auth headers or raw enterprise records. */
export class NexusApiEvidence {
  constructor(private readonly page: Page) {}

  async capture(action: () => Promise<void>): Promise<NexusApiSnapshot> {
    const entries = Object.entries(endpoints);
    const responsesPromise = Promise.all(entries.map(async ([key, endpoint]) => {
      const response = await this.page.waitForResponse(candidate =>
        candidate.request().method() === 'POST' && new URL(candidate.url()).pathname === endpoint,
      { timeout: 90000 });
      if (!response.ok()) throw new Error(`Nexus aggregate ${key} returned HTTP ${response.status()}`);
      return { key, response };
    }));
    const [responses] = await Promise.all([responsesPromise, action()]);
    const payloads: Record<string, unknown> = {};
    const requests: FilterSelections[] = [];
    for (const { key, response } of responses) {
      payloads[key] = await this.readJson(response, key);
      const request: unknown = response.request().postDataJSON();
      const selection = object(request, `${key} filters`);
      requests.push({ platform: text(selection.platform, 'platform'),
        cluster: text(selection.cluster, 'cluster'), deploymentType: text(selection.deploymentType, 'deploymentType') });
    }
    return decodeSnapshot(payloads, requests);
  }

  private async readJson(response: Response, subject: string): Promise<unknown> {
    try { return await response.json() as unknown; }
    catch { throw new Error(`Nexus ${subject} response is not valid JSON; raw body withheld`); }
  }
}

function numberRecord(value: unknown, subject: string): Record<string, number> {
  return Object.fromEntries(Object.entries(object(value, subject)).map(([key, item]) => [key, numeric(item, `${subject}.${key}`)]));
}

function decodeSnapshot(payloads: Record<string, unknown>, requests: FilterSelections[]): NexusApiSnapshot {
  const summary = object(payloads.summary, 'summary');
  const devices = object(payloads.devices, 'devices');
  const features = object(payloads.features, 'features');
  const enterprise = object(object(payloads.enterprises, 'enterprise-category').enterpriseCategory, 'enterpriseCategory');
  const licenses = object(payloads.licenses, 'licenses');
  const resellers = object(payloads.resellers, 'resellers');
  const trunks = object(payloads.trunks, 'trunks');
  const deviceMatrix = object(devices.deviceMatrix, 'deviceMatrix');
  const endpointAdoption = object(devices.endpointAdoption, 'endpointAdoption');
  const featureBreadth = object(features.featureBreadth, 'featureBreadth');
  const aiFeatures = object(payloads.aiFeatures, 'aiFeatures');
  const vendorSummary = object(devices.vendorCategoryPercentageSummary, 'vendorCategoryPercentageSummary');
  const totalDevices = numeric(summary.devices, 'devices');
  const eolDevices = numeric(devices.eolDevices, 'eolDevices');
  return {
    requests,
    expectedMetrics: {
      enterprises: numeric(summary.enterprises, 'enterprises'), users: numeric(summary.users, 'users'),
      devices: totalDevices, devicesEolPercent: totalDevices === 0 ? 0 : Math.round(eolDevices / totalDevices * 100),
      // Thresholds observed in processPlatformDashboardSummary in F.v1.148.0.
      // These verify presentation against the API, not independent business-policy correctness.
      churnRiskEnterprises: array(payloads.churn, 'churn').filter(item => numeric(object(item, 'churn row').churnRiskScore, 'churnRiskScore') >= 30).length,
      migrationReadyEnterprises: array(payloads.migration, 'migration').filter(item => numeric(object(item, 'migration row').migrationReadinessScore, 'migrationReadinessScore') >= 50).length,
      trunks: numeric(trunks.totalTrunks, 'totalTrunks'),
      aiOpportunityAccounts: numeric(summary.aiOpportunities, 'aiOpportunities'),
      aiReadyUsers: numeric(summary.aiReadyUsers, 'aiReadyUsers'),
      totalResellers: numeric(resellers.totalResellers, 'totalResellers'),
      aiServicesPotential: array(summary.featuresWithAIEquivalent, 'featuresWithAIEquivalent').length,
      groups: numeric(summary.groupCount, 'groupCount'),
    },
    enterpriseCategories: array(enterprise.categories, 'enterprise categories').map(item => {
      const row = object(item, 'enterprise category');
      return { category: text(row.category, 'category'), count: numeric(row.count, 'count'), totalUsers: numeric(row.totalUsers, 'totalUsers') };
    }),
    deviceMatrixTotal: numeric(deviceMatrix.totalDevices, 'deviceMatrix.totalDevices'),
    deviceRowTotals: array(deviceMatrix.rows, 'device rows').map(item => numeric(object(item, 'device row').total, 'device row total')),
    endpointCategories: array(endpointAdoption.categories, 'endpoint categories').map(item => {
      const row = object(item, 'endpoint category');
      return { category: text(row.enterpriseCategory, 'endpoint category'),
        deskPhoneCount: numeric(row.deskPhoneCount, 'deskPhoneCount'), softClientCount: numeric(row.softClientCount, 'softClientCount'),
        totalDevices: numeric(row.totalDevices, 'totalDevices'), deskPhonePercentage: numeric(row.deskPhonePercentage, 'deskPhonePercentage'),
        softClientPercentage: numeric(row.softClientPercentage, 'softClientPercentage') };
    }),
    licenseCombinations: numberRecord(licenses.userLicenseCombinations, 'userLicenseCombinations'),
    knowledgeWorkerBands: numberRecord(licenses.knowledgeWorkerThreshold, 'knowledgeWorkerThreshold'),
    featureBreadth: array(featureBreadth.categories, 'feature breadth categories').map(item => {
      const row = object(item, 'feature breadth category');
      return { category: text(row.enterpriseCategory, 'category'), average: numeric(row.averageFeaturesPerUser, 'averageFeaturesPerUser') };
    }),
    eolSeries: array(vendorSummary.vendors, 'vendors').map(item => {
      const row = object(item, 'vendor');
      return { vendor: text(row.vendor, 'vendor'), percentages: array(row.categoryBreakDown, 'categoryBreakDown')
        .map(category => numeric(object(category, 'vendor category').eolDevicePercentageOfVendor, 'eolDevicePercentageOfVendor')) };
    }),
    aiTargets: [...array(aiFeatures.aiUserFeatures, 'aiUserFeatures'), ...array(aiFeatures.aiGroupFeatures, 'aiGroupFeatures')].map(item => {
      const row = object(item, 'AI feature');
      return { feature: text(row.feature, 'feature'), percentages: array(row.enterpriseCategories, 'AI categories')
        .map(category => numeric(object(category, 'AI category').percentage, 'percentage')) };
    }),
    trunkRowCounts: array(trunks.trunkSummary, 'trunkSummary').map(item => numeric(object(item, 'trunk row').totalTrunks, 'totalTrunks')),
    resellerRowCount: array(resellers.resellerSummary, 'resellerSummary').length,
  };
}
