import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadBrain } from '../src/storage.js';

const exec = promisify(execFile);
const cli = path.resolve('bin/graph-ai.js');

async function fixture() { return fs.mkdtemp(path.join(os.tmpdir(), 'graph-ai-brain-')); }
async function run(root, ...args) { return (await exec(process.execPath, [cli, ...args, '--root', root])).stdout; }

test('init creates an empty agent-owned brain and installs the universal skill', async () => {
  const root = await fixture(); const output = await run(root, 'init'); const brain = await loadBrain(root);
  assert.match(output, /Graph-AI initialized/); assert.equal(brain.chart.summary, ''); assert.deepEqual(brain.chart.areas, []);
  const skill = await fs.readFile(path.join(root, '.ai/skills/repository-brain/SKILL.md'), 'utf8'); assert.match(skill, /Graph-AI does not scan, parse, rank, or infer facts/);
  assert.match(await run(root, 'status'), /Not written yet/); assert.match(await run(root, 'validate'), /Valid/);
});

test('replace stores the first chart without analyzing source files', async () => {
  const root = await fixture(); await run(root, 'init'); await fs.writeFile(path.join(root, 'first-chart.json'), JSON.stringify({ repository: { name: 'product' }, chart: { summary: 'A concise product.', areas: [{ id: 'checkout', label: 'Checkout', summary: 'Completes purchases.', evidence: ['src/checkout.js'] }], workflows: [], decisions: [], conventions: [] } }));
  assert.match(await run(root, 'replace', '--input', 'first-chart.json'), /Brain replaced/);
  const brain = await loadBrain(root); assert.equal(brain.repository.name, 'product'); assert.equal(brain.chart.areas[0].label, 'Checkout'); assert.equal(brain.chart.areas[0].evidence[0], 'src/checkout.js');
});

test('apply performs agent-owned CRUD without scanning or validating evidence against files', async () => {
  const root = await fixture(); await run(root, 'init'); await fs.writeFile(path.join(root, 'patch.json'), JSON.stringify({ summary: 'Updated summary.', operations: [{ op: 'upsert', collection: 'workflows', item: { id: 'tests', label: 'Tests', summary: 'Run npm test.', evidence: ['package.json'] } }, { op: 'upsert', collection: 'decisions', item: { id: 'local-first', label: 'Local first', summary: 'The brain stays in the repository.' } }, { op: 'delete', collection: 'decisions', id: 'local-first' }] }));
  assert.match(await run(root, 'apply', '--input', 'patch.json'), /3 operations/);
  const brain = await loadBrain(root); assert.equal(brain.chart.summary, 'Updated summary.'); assert.equal(brain.chart.workflows[0].id, 'tests'); assert.deepEqual(brain.chart.decisions, []);
});

test('init preserves an existing chart and refreshes only the installed skill', async () => {
  const root = await fixture(); await run(root, 'init'); const brain = await loadBrain(root); brain.chart.summary = 'Keep me.'; await fs.writeFile(path.join(root, '.ai/brain.json'), JSON.stringify(brain));
  assert.match(await run(root, 'init'), /existing brain preserved/); assert.equal((await loadBrain(root)).chart.summary, 'Keep me.');
});

test('replace rejects malformed charts without overwriting the existing brain', async () => {
  const root = await fixture(); await run(root, 'init'); const before = await fs.readFile(path.join(root, '.ai/brain.json'), 'utf8');
  await fs.writeFile(path.join(root, 'invalid-chart.json'), JSON.stringify({ repository: { name: 'product' }, chart: { summary: 'Bad chart.', areas: [{ id: 'same', label: 'One', summary: 'First.' }, { id: 'same', label: 'Two', summary: 'Second.' }], workflows: [], decisions: [], conventions: [] } }));
  await assert.rejects(run(root, 'replace', '--input', 'invalid-chart.json'), /duplicate id/);
  assert.equal(await fs.readFile(path.join(root, '.ai/brain.json'), 'utf8'), before);
});

test('validation permits agent-provided evidence paths without analyzing them', async () => {
  const root = await fixture(); await run(root, 'init'); await fs.writeFile(path.join(root, 'chart.json'), JSON.stringify({ repository: { name: 'product' }, chart: { summary: 'A product.', areas: [{ id: 'area', label: 'Area', summary: 'An agent-described area.', evidence: ['not-a-real-file'] }], workflows: [], decisions: [], conventions: [] } }));
  await run(root, 'replace', '--input', 'chart.json'); assert.match(await run(root, 'validate'), /Valid/);
});
