import path from 'node:path';

export class TestDataPrerequisiteError extends Error {
  constructor(message: string) {
    super(`[BLOCKED: TEST DATA] ${message}`);
    this.name = 'TestDataPrerequisiteError';
  }
}

interface ProvisioningDataset {
  sourceFile: string;
  clientId: string;
  clusterId: string;
}
export interface FreshClusterDataset extends ProvisioningDataset {
  purpose: 'fresh';
  approved: true;
}
export interface RegisteredClusterDataset extends ProvisioningDataset {
  purpose: 'registered';
  attemptWorkflowName: string;
  reuseOnly: boolean;
}
export type DiscoveryDataset = FreshClusterDataset | RegisteredClusterDataset;
export interface ExistingWorkflowDataset { purpose: 'read-only'; workflowName?: string }

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new TestDataPrerequisiteError(`${name} is required. No workflow or upload will be attempted.`);
  return value;
}

function provisioningDataset(prefix: 'FRESH' | 'REGISTERED'): ProvisioningDataset {
  const sourceFile = required(`DISCOVERY_${prefix}_SOURCE_FILE`);
  const clientId = process.env.DISCOVERY_CLIENT_ID?.trim() || '018204';
  if (!/^\d+$/.test(clientId)) throw new TestDataPrerequisiteError('DISCOVERY_CLIENT_ID must be numeric');
  const basename = path.basename(sourceFile);
  if (!basename.startsWith(`${clientId}_Provision_`) || !/^\d+_Provision_.+\d{4}\.json\.gz$/.test(basename)) {
    throw new TestDataPrerequisiteError('Provisioning fixture must be clientID_Provision_*.json.gz with a final four-digit numeric suffix');
  }
  const clusterId = required(`DISCOVERY_${prefix}_CLUSTER_ID`);
  const directory = process.env.DISCOVERY_SOURCE_DIR?.trim();
  if (!path.isAbsolute(sourceFile) && !directory) {
    throw new TestDataPrerequisiteError('Relative provisioning filenames require DISCOVERY_SOURCE_DIR');
  }
  return { sourceFile: path.resolve(directory ?? '.', sourceFile), clientId, clusterId };
}

export function freshClusterDataset(): FreshClusterDataset {
  const dataset = provisioningDataset('FRESH');
  if (process.env.DISCOVERY_FRESH_APPROVED?.trim() !== 'true') {
    throw new TestDataPrerequisiteError('DISCOVERY_FRESH_APPROVED=true is required for an approved unused-cluster fixture');
  }
  return { ...dataset, purpose: 'fresh', approved: true };
}

export function registeredClusterDataset(): RegisteredClusterDataset {
  const reuseOnly = Boolean(process.env.CI) || process.env.DISCOVERY_DUPLICATE_REUSE_ONLY === 'true';
  return { ...provisioningDataset('REGISTERED'), purpose: 'registered',
    attemptWorkflowName: reuseOnly ? required('DISCOVERY_DUPLICATE_ATTEMPT_WORKFLOW') :
      process.env.DISCOVERY_DUPLICATE_ATTEMPT_WORKFLOW?.trim() || 'Auto_Duplicate', reuseOnly };
}

export function existingWorkflowDataset(): ExistingWorkflowDataset {
  return { purpose: 'read-only', workflowName: process.env.DISCOVERY_EXISTING_WORKFLOW?.trim() || undefined };
}
