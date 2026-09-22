import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { applyCortexPatch, readCortexSnapshot } from '../src/service.js';
import { loadCortex, saveCortex } from '../src/storage.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repositoryRoot, 'bin/engram.js');
const runs = 80;

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

async function measure(operation, count = runs) {
  const samples = [];
  await operation(); // warm the module and filesystem cache without recording it
  for (let index = 0; index < count; index++) {
    const started = performance.now();
    await operation();
    samples.push(performance.now() - started);
  }
  return { p50_ms: Number(percentile(samples, 0.5).toFixed(3)), p95_ms: Number(percentile(samples, 0.95).toFixed(3)) };
}

function cortex(entryCount) {
  const collections = ['areas', 'workflows', 'decisions', 'conventions'];
  const chart = { summary: 'A compact, agent-authored repository map.', areas: [], workflows: [], decisions: [], conventions: [] };
  for (let index = 0; index < entryCount; index++) {
    const collection = collections[index % collections.length];
    chart[collection].push({
      id: `entry-${index}`,
      label: `Repository concern ${index}`,
      summary: `Durable context entry ${index} maintained by an AI agent.`,
      evidence: [`src/area-${index}.js`]
    });
  }
  return { format_version: 1, repository: { name: 'benchmark-repository', root: '.' }, chart };
}

function runCli(root, ...args) {
  const result = spawnSync(process.execPath, [cli, ...args, '--root', root], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `engram exited ${result.status}`);
  return result.stdout;
}

async function benchmark(entryCount) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'engram-benchmark-'));
  const patchFile = path.join(root, 'patch.json');
  const patch = { operations: [{ op: 'upsert', collection: 'areas', item: { id: 'entry-0', label: 'Repository concern 0', summary: 'Updated durable context maintained by an AI agent.', evidence: ['src/area-0.js'] } }] };
  await saveCortex(root, cortex(entryCount));
  await fs.writeFile(patchFile, JSON.stringify(patch));
  const storedBytes = (await fs.stat(path.join(root, '.engram', 'cortex.json'))).size;

  const directRead = await measure(async () => { await loadCortex(root); });
  const directApply = await measure(async () => {
    const current = await readCortexSnapshot(root);
    await applyCortexPatch(root, { expected_revision: current.revision, patch });
  });
  const cliStatus = await measure(async () => { runCli(root, 'status'); }, 30);
  const cliApply = await measure(async () => {
    const current = JSON.parse(runCli(root, 'read', '--with-revision'));
    runCli(root, 'apply', '--input', patchFile, '--expected-revision', current.revision);
  }, 30);
  await fs.rm(root, { recursive: true, force: true });
  return { entries: entryCount, stored_bytes: storedBytes, direct_read: directRead, direct_apply: directApply, cli_status: cliStatus, cli_apply: cliApply };
}

const result = {
  measured_at: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  runs_per_direct_measurement: runs,
  runs_per_cli_measurement: 30,
  results: []
};
for (const entryCount of [10, 100, 1000, 5000]) result.results.push(await benchmark(entryCount));
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
