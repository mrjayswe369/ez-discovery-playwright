const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = process.env.DISCOVERY_CI_FIXTURE_DIR;
if (directory) {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(process.env.RUNNER_TEMP || os.tmpdir()) || !path.basename(resolved).startsWith('ez-discovery-ci-')) {
    throw new Error('Refusing fixture cleanup outside the dedicated runner temporary directory');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}
