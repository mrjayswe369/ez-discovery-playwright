const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { ciPolicy } = require('./ci-policy.cjs');

try {
  const policy = ciPolicy();
  const required = ['BASE_URL', 'TEST_EMAIL', 'TEST_PASSWORD'];
  if (policy.includeDuplicate) required.push('CI_DUPLICATE_APPROVED', 'DISCOVERY_REGISTERED_GZIP_BASE64',
    'DISCOVERY_REGISTERED_SOURCE_NAME', 'DISCOVERY_REGISTERED_CLUSTER_ID', 'DISCOVERY_REGISTERED_SHA256',
    'DISCOVERY_DUPLICATE_ATTEMPT_WORKFLOW');
  const missing = required.filter(name => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing CI configuration: ${missing.join(', ')}. Configure qa environment secrets/variables; fork PRs do not receive QA secrets.`);
  if (new URL(process.env.BASE_URL).protocol !== 'https:') throw new Error('QA BASE_URL must use HTTPS');
  if (policy.includeDuplicate) {
    if (process.env.CI_DUPLICATE_APPROVED !== 'true') throw new Error('Duplicate fixture requires CI_DUPLICATE_APPROVED=true');
    const name = process.env.DISCOVERY_REGISTERED_SOURCE_NAME;
    const client = process.env.DISCOVERY_CLIENT_ID || '018204';
    if (path.basename(name) !== name || /[\\/\r\n]/.test(name) || !/^\d+_Provision_.+\d{4}\.json\.gz$/.test(name) || !name.startsWith(`${client}_Provision_`)) {
      throw new Error('Registered source name must be a plain clientID_Provision_*.json.gz basename');
    }
    const encoded = process.env.DISCOVERY_REGISTERED_GZIP_BASE64.replace(/\s/g, '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('Registered fixture secret is not valid base64');
    const archive = Buffer.from(encoded, 'base64');
    if (archive[0] !== 0x1f || archive[1] !== 0x8b) throw new Error('Registered fixture must remain a GZIP archive');
    const expected = process.env.DISCOVERY_REGISTERED_SHA256;
    if (!/^[a-f0-9]{64}$/.test(expected) || crypto.createHash('sha256').update(archive).digest('hex') !== expected) throw new Error('Registered fixture does not match its approved SHA-256');
    const run = Number(process.env.GITHUB_RUN_NUMBER);
    const attempt = Number(process.env.GITHUB_RUN_ATTEMPT);
    const rank = (run - 1) * 10 + attempt - 1;
    if (!Number.isSafeInteger(run) || run < 1 || !Number.isSafeInteger(attempt) || attempt < 1 || attempt > 10 || rank > 9998) {
      throw new Error('Four-digit CI upload allocation exhausted or GitHub run identity unavailable; supply a new approved source filename and allocation policy. Never wrap the suffix.');
    }
    const originalSuffix = Number(name.match(/(\d{4})\.json\.gz$/)[1]);
    const suffix = String(rank >= originalSuffix ? rank + 1 : rank).padStart(4, '0');
    if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is required to pass a private fixture path to the test step');
    const directory = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'ez-discovery-ci-'));
    fs.writeFileSync(path.join(directory, name), archive, { flag: 'wx', mode: 0o600 });
    fs.appendFileSync(process.env.GITHUB_ENV, [
      `DISCOVERY_SOURCE_DIR=${directory}`, `DISCOVERY_REGISTERED_SOURCE_FILE=${name}`,
      `DISCOVERY_CI_FIXTURE_DIR=${directory}`, `DISCOVERY_CI_UPLOAD_SUFFIX=${suffix}`,
      'DISCOVERY_DUPLICATE_REUSE_ONLY=true', '',
    ].join('\n'));
  }
  console.log(`CI prerequisites verified. Duplicate fixture ${policy.includeDuplicate ? 'approved; reuse-only' : 'excluded before execution'}.`);
} catch (error) {
  const message = error.message;
  if (process.env.GITHUB_ACTIONS === 'true') {
    const escaped = message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.error(`::error title=CI prerequisites::${escaped}`);
  } else console.error(message);
  process.exitCode = 1;
}
