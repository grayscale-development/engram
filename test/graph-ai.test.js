import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { buildCortexIndex, searchCortexIndex } from '../src/index.js';
import { handleMcpRequest } from '../src/mcp.js';
import { recoverHistory } from '../src/history.js';
import { applyCortexPatch, readCortexSnapshot, replaceCortex, verifyCortexHistory } from '../src/service.js';
import { loadCortex, validateCortex } from '../src/storage.js';

const exec = promisify(execFile);
const cli = path.resolve('bin/engram.js');
const mcpBin = path.resolve('bin/engram-mcp.js');
async function fixture() { return fs.mkdtemp(path.join(os.tmpdir(), 'engram-cortex-')); }
async function run(root, ...args) { return (await exec(process.execPath, [cli, ...args, '--root', root])).stdout; }
async function snapshot(root) { return JSON.parse(await run(root, 'read', '--with-revision')); }
async function writeJson(root, name, value) { const file = path.join(root, name); await fs.writeFile(file, JSON.stringify(value)); return file; }
const chart = (name, summary = 'A concise product.') => ({ repository: { name }, chart: { summary, areas: [], workflows: [], decisions: [], conventions: [] } });

test('init creates an empty agent-owned Cortex and installs the Cerebellum', async () => {
  const root = await fixture(); const output = await run(root, 'init'); const cortex = await loadCortex(root);
  assert.match(output, /Engram initialized/); assert.equal(cortex.chart.summary, ''); assert.deepEqual(cortex.chart.areas, []);
  const skill = await fs.readFile(path.join(root, '.engram/skills/cerebellum/SKILL.md'), 'utf8'); assert.match(skill, /Engram does not scan, parse, rank, or infer facts/);
  assert.match(await run(root, 'status'), /Revision:/); assert.match(await run(root, 'validate'), /Valid/);
});

test('replace and apply require a fresh revision and preserve agent-owned CRUD', async () => {
  const root = await fixture(); await run(root, 'init'); const first = await snapshot(root); const replacement = await writeJson(root, 'first-chart.json', chart('product'));
  assert.match(await run(root, 'replace', '--input', replacement, '--expected-revision', first.revision), /Cortex replaced/);
  const afterReplace = await snapshot(root); const patch = await writeJson(root, 'patch.json', { summary: 'Updated summary.', operations: [{ op: 'upsert', collection: 'workflows', item: { id: 'tests', label: 'Tests', summary: 'Run npm test.', evidence: ['package.json'] } }, { op: 'upsert', collection: 'decisions', item: { id: 'local-first', label: 'Local first', summary: 'The brain stays in the repository.' } }, { op: 'delete', collection: 'decisions', id: 'local-first' }] });
  assert.match(await run(root, 'apply', '--input', patch, '--expected-revision', afterReplace.revision), /3 operations/);
  const cortex = await loadCortex(root); assert.equal(cortex.chart.summary, 'Updated summary.'); assert.equal(cortex.chart.workflows[0].id, 'tests'); assert.deepEqual(cortex.chart.decisions, []);
  await assert.rejects(run(root, 'apply', '--input', patch, '--expected-revision', afterReplace.revision), /Cortex revision conflict/);
  await assert.rejects(run(root, 'apply', '--input', patch), /--expected-revision is required/);
});

test('init preserves an existing Cortex and compact reads can include revisions', async () => {
  const root = await fixture(); await run(root, 'init'); const before = await snapshot(root);
  assert.match(await run(root, 'init'), /existing Cortex preserved/);
  const after = await snapshot(root); assert.equal(after.revision, before.revision);
  const compact = await run(root, 'read'); const pretty = await run(root, 'read', '--with-revision', '--pretty');
  assert.doesNotMatch(compact, /\n  /); assert.match(pretty, /\n  "revision"/); assert.deepEqual(JSON.parse(compact), after.cortex);
});

test('validation rejects oversized agent context before persistence', () => {
  assert.throws(() => validateCortex(chart('product', 'x'.repeat(16385))), /AI context limit/);
  const huge = chart('product'); huge.chart.areas = Array.from({ length: 5001 }, (_, index) => ({ id: `entry-${index}`, label: 'Entry', summary: 'Durable.' }));
  assert.throws(() => validateCortex(huge), /working-set limit/);
});

test('history is append-only, content-addressed, and recoverable', async () => {
  const root = await fixture(); await run(root, 'init'); const initial = await readCortexSnapshot(root);
  const patch = { operations: [{ op: 'upsert', collection: 'areas', item: { id: 'core', label: 'Core', summary: 'Durable behavior.', evidence: ['src/core.js'] } }] };
  const changed = await applyCortexPatch(root, { expected_revision: initial.revision, patch, history: true });
  const verified = await verifyCortexHistory(root); const recovered = await recoverHistory(root);
  assert.deepEqual(verified, { valid: true, events: 1, snapshots: 1, revision: changed.revision });
  assert.equal(recovered.revision, changed.revision); assert.deepEqual(recovered.cortex, changed.cortex);
});

test('simultaneous writers cannot silently overwrite one another', async () => {
  const root = await fixture(); await run(root, 'init'); const initial = await readCortexSnapshot(root);
  const mutation = (id) => applyCortexPatch(root, { expected_revision: initial.revision, patch: { operations: [{ op: 'upsert', collection: 'areas', item: { id, label: id, summary: 'Durable behavior.' } }] } });
  const results = await Promise.allSettled([mutation('first'), mutation('second')]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const failure = results.find((result) => result.status === 'rejected').reason;
  assert.ok(['CORTEX_BUSY', 'REVISION_CONFLICT'].includes(failure.code));
  assert.equal((await readCortexSnapshot(root)).cortex.chart.areas.length, 1);
});

test('history writes a periodic recovery checkpoint after fifty events', async () => {
  const root = await fixture(); await run(root, 'init'); let current = await readCortexSnapshot(root);
  for (let index = 0; index < 50; index++) current = await applyCortexPatch(root, { expected_revision: current.revision, history: true, patch: { operations: [{ op: 'upsert', collection: 'areas', item: { id: 'core', label: 'Core', summary: `Durable behavior ${index}.` } }] } });
  const verified = await verifyCortexHistory(root); const recovered = await recoverHistory(root);
  assert.equal(verified.events, 50); assert.equal(verified.snapshots, 2); assert.equal(recovered.revision, current.revision);
});

test('derived indexes use only explicit Cortex snapshots and search their entries', async () => {
  const left = await fixture(); const right = await fixture(); await run(left, 'init'); await run(right, 'init');
  const leftSnapshot = await readCortexSnapshot(left); const rightSnapshot = await readCortexSnapshot(right);
  await applyCortexPatch(left, { expected_revision: leftSnapshot.revision, patch: { operations: [{ op: 'upsert', collection: 'areas', item: { id: 'checkout', label: 'Checkout', summary: 'Completes card purchases.', evidence: ['src/checkout.js'] } }] } });
  await applyCortexPatch(right, { expected_revision: rightSnapshot.revision, patch: { operations: [{ op: 'upsert', collection: 'workflows', item: { id: 'delivery', label: 'Delivery', summary: 'Deploys applications.', evidence: ['ci/deploy.yml'] } }] } });
  const index = await buildCortexIndex([left, right]); const result = searchCortexIndex(index, 'card purchase');
  assert.equal(index.repositories.length, 2); assert.equal(result.matches.length, 1); assert.equal(result.matches[0].id, 'checkout');
  const configuration = await writeJson(left, 'roots.json', { roots: [left, right] });
  assert.match(await run(left, 'index', '--input', configuration, '--output', 'cortex-index.json'), /Repositories: 2/);
  assert.match(await run(left, 'search', '--index', 'cortex-index.json', '--query', 'card purchase'), /checkout/);
});

test('the persistent MCP handler returns structured snapshots and mutation conflicts', async () => {
  const root = await fixture(); await run(root, 'init');
  const read = await handleMcpRequest({ method: 'tools/call', params: { name: 'engram_read', arguments: { root } } });
  const first = read.structuredContent;
  const applied = await handleMcpRequest({ method: 'tools/call', params: { name: 'engram_apply', arguments: { root, expected_revision: first.revision, patch: { operations: [{ op: 'upsert', collection: 'conventions', item: { id: 'compact', label: 'Compact', summary: 'Keep context small.' } }] } } } });
  assert.equal(applied.structuredContent.cortex.chart.conventions[0].id, 'compact');
  await assert.rejects(handleMcpRequest({ method: 'tools/call', params: { name: 'engram_apply', arguments: { root, expected_revision: first.revision, patch: { operations: [] } } } }), (error) => error.code === 'REVISION_CONFLICT' && error.current.revision === applied.structuredContent.revision);
});

test('the MCP stdio server handles initialize and tools/list without process restart', async () => {
  const child = spawn(process.execPath, [mcpBin], { stdio: ['pipe', 'pipe', 'pipe'] }); let buffered = ''; const responses = new Map();
  child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { buffered += chunk; let newline; while ((newline = buffered.indexOf('\n')) >= 0) { const line = buffered.slice(0, newline); buffered = buffered.slice(newline + 1); const message = JSON.parse(line); responses.get(message.id)?.(message); } });
  const request = (id, method, params = {}) => new Promise((resolve) => { responses.set(id, resolve); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
  const initialized = await request(1, 'initialize', { protocolVersion: '2024-11-05' }); const listed = await request(2, 'tools/list'); child.kill();
  assert.equal(initialized.result.serverInfo.name, 'engram'); assert.equal(listed.result.tools.find((tool) => tool.name === 'engram_apply').inputSchema.required.includes('expected_revision'), true);
});
