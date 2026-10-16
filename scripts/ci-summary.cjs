const fs = require('node:fs');
const { ciPolicy } = require('./ci-policy.cjs');

const policy = ciPolicy();
const file = 'test-results/discovery-lifecycle-summary.json';
const lines = ['## EZ Discovery Chromium quality gate', '',
  `Selected policy: ${policy.expectedCount} repeatable tests; DISC-001 excluded (consumes fresh data); DISC-003 ${policy.includeDuplicate ? 'enabled with approved fixture and reuse-only attempt' : 'excluded by default'}.`, '',
  '| Stage | Outcome |', '| --- | --- |'];
for (const stage of ['INSTALL', 'TYPECHECK', 'BROWSER', 'PREREQUISITES', 'TESTS', 'ARTIFACT_AUDIT']) {
  lines.push(`| ${stage} | ${process.env[`CI_${stage}_OUTCOME`] || 'not executed'} |`);
}
let invalid = false;
if (fs.existsSync(file)) {
  const result = JSON.parse(fs.readFileSync(file, 'utf8'));
  const counts = result.counts;
  lines.push('', `Tests: **${counts.passed} passed, ${counts.failed} failed, ${counts.blocked} BLOCKED, ${counts.skipped} skipped**.`,
    `Playwright duration: ${(result.durationMs / 1000).toFixed(1)} seconds.`, '', '| Family | Passed | Failed | BLOCKED |', '| --- | ---: | ---: | ---: |');
  for (const [family, selected] of Object.entries({
    Functional: result.tests.filter(test => test.category === 'functional'),
    'Expected duplicate rejection': result.tests.filter(test => test.category === 'expected-duplicate-rejection'),
  })) lines.push(`| ${family} | ${selected.filter(test => test.status === 'PASS').length} | ${selected.filter(test => test.status === 'FAIL').length} | ${selected.filter(test => test.status === 'BLOCKED').length} |`);
  for (const test of result.tests.filter(test => test.status !== 'PASS')) {
    // Titles are repository-controlled; record payloads, messages and secret values are never copied here.
    lines.push('', `- ${test.status}: ${test.title.replace(/[\r\n|`<>]/g, '')}`);
  }
  const incomplete = result.tests.length !== policy.expectedCount || counts.skipped > 0;
  invalid = incomplete || counts.failed > 0 || counts.blocked > 0 || result.runnerStatus !== 'passed';
  if (incomplete) lines.push('', '**Quality gate failed: missing executions or selected tests skipped.**');
} else {
  lines.push('', '**Tests did not complete; no passing regression is claimed. Inspect the failed prerequisite/stage.**');
  invalid = true;
}
lines.push('', 'NEX-007 remains required. A hosted/category enterprise-total discrepancy fails the gate; expected values are not replaced.',
  '', 'Artifacts contain masked screenshots and sanitized action traces; raw traces, credentials and provisioning archives are excluded.', '');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
else console.log(lines.join('\n'));
if (invalid) process.exitCode = 1;
