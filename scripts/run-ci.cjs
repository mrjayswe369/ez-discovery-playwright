const { spawnSync } = require('node:child_process');
const { ciPolicy } = require('./ci-policy.cjs');

try {
  const policy = ciPolicy();
  const args = ['test', '--project=chromium', '--workers=1', '--retries=0', '--grep', policy.grep];
  const listing = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), ...args, '--list', '--reporter=json'],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (listing.error) throw listing.error;
  if (listing.status !== 0) throw new Error(`CI discovery failed: ${listing.stderr}`);
  const report = JSON.parse(listing.stdout);
  const specs = [];
  function collect(suite) {
    specs.push(...(suite.specs ?? []));
    for (const child of suite.suites ?? []) collect(child);
  }
  for (const suite of report.suites) collect(suite);
  for (const spec of specs) {
    if (!Array.isArray(spec.tags) || spec.tags.some(tag => typeof tag !== 'string')) throw new Error('Playwright discovery must expose string tags');
    // The JSON reporter removes @; the public test-details API retains it.
    spec.tags = spec.tags.map(tag => tag.startsWith('@') ? tag : `@${tag}`);
  }
  if (specs.length !== policy.expectedCount) throw new Error(`CI inventory expected ${policy.expectedCount} tests, discovered ${specs.length}; review tags and policy together`);
  for (const [tag, expected] of Object.entries(policy.families)) {
    const actual = specs.filter(spec => spec.tags.includes(tag)).length;
    if (actual !== expected) throw new Error(`CI inventory ${tag}: expected ${expected}, discovered ${actual}`);
  }
  for (const spec of specs) {
    const approvedTag = spec.tags.includes('@ci') || (policy.includeDuplicate && spec.tags.includes('@registered-data'));
    if (!approvedTag || !spec.tags.includes('@repeatable') || spec.tags.includes('@fresh-data')) throw new Error('CI selected a test outside the approved repeatable policy');
  }
  console.log(`CI inventory verified: ${specs.length} Chromium tests; fresh-data excluded; Nexus consistency required; duplicate ${policy.includeDuplicate ? 'enabled' : 'excluded'}.`);
  const extra = process.argv.slice(2);
  if (extra.some(arg => arg !== '--list')) throw new Error('test:ci accepts only --list; its execution policy cannot be overridden');
  const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), ...args, ...extra], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
