import { test } from '../../fixtures/baseFixtures';
import { TestDataPrerequisiteError } from '../../fixtures/discoveryData';

export function requireDiscoveryData(condition: boolean, message: string): asserts condition {
  if (condition) return;
  const error = new TestDataPrerequisiteError(message);
  test.info().annotations.push({ type: 'BLOCKED', description: error.message });
  throw error;
}
