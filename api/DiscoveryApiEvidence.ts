import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';

export interface DiscoveryWorkflowSnapshot {
  id: string;
  name: string;
  clusterId: string;
  status: string | null;
  provisioningFileCount: number;
  fingerprint: string;
}

function record(value: unknown, subject: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${subject}: expected an object`);
  return value as Record<string, unknown>;
}
function string(value: unknown, subject: string): string {
  if (typeof value !== 'string') throw new Error(`${subject}: expected a string`);
  return value;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}
function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

/** UI-triggered read evidence. Raw authenticated payloads are never attached or logged. */
export class DiscoveryApiEvidence {
  constructor(private readonly page: Page) {}

  async workflows(action: () => Promise<unknown>): Promise<DiscoveryWorkflowSnapshot[]> {
    const responsePromise = this.page.waitForResponse(response => response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/discovery/workflow/list', { timeout: 30000 });
    const [response] = await Promise.all([responsePromise, action()]);
    if (!response.ok()) throw new Error(`Workflow list returned HTTP ${response.status()}`);
    const body = record(await response.json() as unknown, 'Workflow list');
    if (!Array.isArray(body.workflows)) throw new Error('Workflow list must contain workflows');
    return body.workflows.map((value: unknown) => {
      const row = record(value, 'Workflow');
      if (!Array.isArray(row.provisioningDataFiles)) throw new Error('Workflow provisioning files must be an array');
      if (row.processingStatus !== undefined && row.processingStatus !== null && typeof row.processingStatus !== 'string') {
        throw new Error('Workflow processing status must be a string or absent');
      }
      return { id: string(row._id, 'Workflow id'), name: string(row.discoveryName, 'Workflow name'),
        clusterId: string(row.clusterName, 'Workflow cluster'), status: row.processingStatus ?? null,
        provisioningFileCount: row.provisioningDataFiles.length, fingerprint: fingerprint(row) };
    });
  }

  async insightFingerprint(workflowId: string, action: () => Promise<unknown>): Promise<string> {
    const responsePromise = this.page.waitForResponse(response => response.request().method() === 'GET' &&
      new URL(response.url()).pathname === `/discovery/workflow/${workflowId}/insights`, { timeout: 30000 });
    const [response] = await Promise.all([responsePromise, action()]);
    if (!response.ok()) throw new Error(`Registered workflow insights returned HTTP ${response.status()}`);
    const body = record(await response.json() as unknown, 'Registered insights');
    const workflow = record(body.workflow, 'Registered workflow');
    const cluster = record(body.cluster, 'Registered cluster');
    if (workflow._id !== workflowId || !Array.isArray(body.enterprises) || body.enterprises.length === 0 ||
        typeof cluster.clusterName !== 'string') throw new Error('Registered workflow must contain populated cluster and enterprise insights');
    return fingerprint(body);
  }
}
