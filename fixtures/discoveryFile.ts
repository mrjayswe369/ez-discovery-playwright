import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DiscoveryDataset, TestDataPrerequisiteError } from './discoveryData';

export interface DiscoveryFile {
  path: string;
  filename: string;
  sha256: string;
  clientId: string;
  clusterId: string;
}

async function reserveFilename(basename: string, dataset: DiscoveryDataset): Promise<string> {
  if (!/\d{4}\.json\.gz$/.test(basename)) {
    throw new Error('Source archive must end with four numeric digits followed by .json.gz');
  }
  // Keep reservations between runs, including concurrent workers and CI retries.
  const history = path.resolve(__dirname, '../.discovery-upload-history');
  await mkdir(history, { recursive: true });
  if (process.env.CI && dataset.purpose === 'registered') {
    const suffix = process.env.DISCOVERY_CI_UPLOAD_SUFFIX;
    if (!suffix || !/^\d{4}$/.test(suffix)) throw new TestDataPrerequisiteError('CI registered uploads require an allocated DISCOVERY_CI_UPLOAD_SUFFIX');
    const filename = basename.replace(/\d{4}(?=\.json\.gz$)/, suffix);
    if (filename === basename) throw new TestDataPrerequisiteError('Allocated CI suffix must differ from the original source filename');
    try { await writeFile(path.join(history, `${filename}.used`), '', { flag: 'wx' }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new TestDataPrerequisiteError('Allocated CI upload filename was already used; never retry the same filename');
      throw error;
    }
    return filename;
  }
  const start = Date.now() % 10000;
  for (let offset = 0; offset < 10000; offset++) {
    const digits = String((start + offset) % 10000).padStart(4, '0');
    const filename = basename.replace(/\d{4}(?=\.json\.gz$)/, digits);
    if (filename === basename) continue;
    try {
      await writeFile(path.join(history, `${filename}.used`), '', { flag: 'wx' });
      return filename;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error('All four-digit filename variants have been reserved. Supply a new source archive.');
}

async function removeTemporaryDirectory(directory: string): Promise<void> {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith('ez-discovery-')) {
    throw new Error('Refusing to clean a directory outside the discovery temporary root');
  }
  await rm(resolved, { recursive: true, force: true });
}

export function validateDiscoveryFilename(filename: string, clientId: string): void {
  if (!/^\d+$/.test(clientId) || !filename.startsWith(`${clientId}_`) ||
      !/^\d+_Provision_.+\.json(?:\.gz)?$/.test(filename)) {
    throw new Error(`Invalid discovery filename: expected ${clientId}_Provision_*.json[.gz]`);
  }
}

export async function prepareDiscoveryFile(dataset: DiscoveryDataset): Promise<{ file: DiscoveryFile; dispose: () => Promise<void> }> {
  const { sourceFile: source, clientId, clusterId } = dataset;
  const basename = path.basename(source);
  validateDiscoveryFilename(basename, clientId);
  if (!basename.endsWith('.json.gz')) throw new TestDataPrerequisiteError('An approved compressed .json.gz fixture is required');
  const original = await readFile(source).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT' || error.code === 'EACCES') {
      throw new TestDataPrerequisiteError(`${dataset.purpose} provisioning archive is missing or unreadable`);
    }
    throw error;
  });
  if (original[0] !== 0x1f || original[1] !== 0x8b) throw new TestDataPrerequisiteError('Configured provisioning fixture is not a GZIP archive');
  const sha256 = createHash('sha256').update(original).digest('hex');
  if (dataset.purpose === 'fresh') {
    const stateDirectory = path.resolve(__dirname, '../.discovery-fixture-state');
    await mkdir(stateDirectory, { recursive: true });
    const identity = createHash('sha256').update(`${process.env.BASE_URL}\n${clientId}\n${clusterId}\n${sha256}`).digest('hex');
    try {
      await writeFile(path.join(stateDirectory, `${identity}.reserved`), JSON.stringify({ reservedAt: new Date().toISOString() }), { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new TestDataPrerequisiteError('Fresh fixture was already reserved by an earlier attempt. Verify server state and provision new approved data; filename rotation does not make it fresh.');
      }
      throw error;
    }
  }
  const filename = await reserveFilename(basename, dataset);
  validateDiscoveryFilename(filename, clientId);
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'ez-discovery-'));
  try {
    const destination = path.join(temporaryDirectory, filename);
    // Copy the compressed archive as-is. Never decompress or recompress it.
    await copyFile(source, destination, constants.COPYFILE_EXCL);
    if (createHash('sha256').update(await readFile(destination)).digest('hex') !== sha256) {
      throw new Error('Temporary archive differs from the source');
    }
    return {
      file: { path: destination, filename, sha256, clientId, clusterId },
      dispose: () => removeTemporaryDirectory(temporaryDirectory),
    };
  } catch (error) {
    await removeTemporaryDirectory(temporaryDirectory);
    throw error;
  }
}
