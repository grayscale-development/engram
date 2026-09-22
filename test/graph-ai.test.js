import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadCortex } from '../src/storage.js';

const exec = promisify(execFile);
const cli = path.resolve('bin/engram.js');

async function fixture() { return fs.mkdtemp(path.join(os.tmpdir(), 'engram-cortex-')); }
async function run(root, ...args) { return (await exec(process.execPath, [cli, ...args, '--root', root])).stdout; }

test('init creates an empty agent-owned Cortex and installs the Cerebellum', async () => {
  const root = await fixture(); const output = await run(root, 'init'); const cortex = await loadCortex(root);
  assert.match(output, /Engram initialized/); assert.equal(cortex.chart.summary, ''); assert.deepEqual(cortex.chart.areas, []);
  const skill = await fs.readFile(path.join(root, '.engram/skills/cerebellum/SKILL.md'), 'utf8'); assert.match(skill, /Engram does not scan, parse, rank, or infer facts/);
  assert.match(await run(root, 'status'), /Not written yet/); assert.match(await run(root, 'validate'), /Valid/);
});

test('replace stores the first Cortex without analyzing source files', async () => {
  const root = await fixture(); await run(root, 'init'); await fs.writeFile(path.join(root, 'first-chart.json'), JSON.stringify({ repository: { name: 'product' }, chart: { summary: 'A concise product.', areas: [{ id: 'checkout', label: 'Checkout', summary: 'Completes purchases.', evidence: ['src/checkout.js'] }], workflows: [], decisions: [], conventions: [] } }));
  assert.match(await run(root, 'replace', '--input', 'first-chart.json'), /Cortex replaced/);
  const cortex = await loadCortex(root); assert.equal(cortex.repository.name, 'product'); assert.equal(cortex.chart.areas[0].label, 'Checkout'); assert.equal(cortex.chart.areas[0].evidence[0], 'src/checkout.js');
});

test('apply performs agent-owned CRUD without scanning or validating evidence against files', async () => {
  const root = await fixture(); await run(root, 'init'); await fs.writeFile(path.join(root, 'patch.json'), JSON.stringify({ summary: 'Updated summary.', operations: [{ op: 'upsert', collection: 'workflows', item: { id: 'tests', label: 'Tests', summary: 'Run npm test.', evidence: ['package.json'] } }, { op: 'upsert', collection: 'decisions', item: { id: 'local-first', label: 'Local first', summary: 'The brain stays in the repository.' } }, { op: 'delete', collection: 'decisions', id: 'local-first' }] }));
  assert.match(await run(root, 'apply', '--input', 'patch.json'), /3 operations/);
  const cortex = await loadCortex(root); assert.equal(cortex.chart.summary, 'Updated summary.'); assert.equal(cortex.chart.workflows[0].id, 'tests'); assert.deepEqual(cortex.chart.decisions, []);
});

test('init preserves an existing Cortex and refreshes only the Cerebellum', async () => {
  const root = await fixture(); await run(root, 'init'); const cortex = await loadCortex(root); cortex.chart.summary = 'Keep me.'; await fs.writeFile(path.join(root, '.engram/cortex.json'), JSON.stringify(cortex));
  assert.match(await run(root, 'init'), /existing Cortex preserved/); assert.equal((await loadCortex(root)).chart.summary, 'Keep me.');
});

test('replace rejects malformed charts without overwriting the existing Cortex', async () => {
  const root = await fixture(); await run(root, 'init'); const before = await fs.readFile(path.join(root, '.engram/cortex.json'), 'utf8');
  await fs.writeFile(path.join(root, 'invalid-chart.json'), JSON.stringify({ repository: { name: 'product' }, chart: { summary: 'Bad chart.', areas: [{ id: 'same', label: 'One', summary: 'First.' }, { id: 'same', label: 'Two', summary: 'Second.' }], workflows: [], decisions: [], conventions: [] } }));
  await assert.rejects(run(root, 'replace', '--input', 'invalid-chart.json'), /duplicate id/);
  assert.equal(await fs.readFile(path.join(root, '.engram/cortex.json'), 'utf8'), before);
});

test('validation permits agent-provided evidence paths without analyzing them', async () => {
  const root = await fixture(); await run(root, 'init'); await fs.writeFile(path.join(root, 'chart.json'), JSON.stringify({ repository: { name: 'product' }, chart: { summary: 'A product.', areas: [{ id: 'area', label: 'Area', summary: 'An agent-described area.', evidence: ['not-a-real-file'] }], workflows: [], decisions: [], conventions: [] } }));
  await run(root, 'replace', '--input', 'chart.json'); assert.match(await run(root, 'validate'), /Valid/);
});
