import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { automaticEvidenceSummary } from '../src/evidence.js';
import { buildCortexIndex, focusCortex, searchCortexIndex } from '../src/index.js';
import { handleMcpRequest } from '../src/mcp.js';
import { recoverHistory } from '../src/history.js';
import { applyCortexPatch, readCortexSnapshot, replaceCortex, verifyCortexHistory } from '../src/service.js';
import { loadCortex, validateCortex, withCortexLock } from '../src/storage.js';

const exec = promisify(execFile);
const cli = path.resolve('bin/engram.js');
const mcpBin = path.resolve('bin/engram-mcp.js');
async function fixture() { return fs.mkdtemp(path.join(os.tmpdir(), 'engram-cortex-')); }
async function run(root, ...args) { return (await exec(process.execPath, [cli, ...args, '--root', root])).stdout; }
async function runInstalled(root, ...args) { return (await exec(process.execPath, [path.join(root, '.engram/runtime/bin/engram.js'), ...args, '--root', root])).stdout; }
async function runInstalledResult(root, ...args) { return exec(process.execPath, [path.join(root, '.engram/runtime/bin/engram.js'), ...args, '--root', root]); }
async function snapshot(root) { return JSON.parse(await run(root, 'read', '--with-revision')); }
async function writeJson(root, name, value) { const file = path.join(root, name); await fs.writeFile(file, JSON.stringify(value)); return file; }
const chart = (name, summary = 'A concise product.') => ({ repository: { name }, chart: { summary, areas: [], workflows: [], decisions: [], conventions: [] } });

test('init creates an empty agent-owned Cortex and installs the Cerebellum', async () => {
  const root = await fixture(); const output = await run(root, 'init'); const cortex = await loadCortex(root);
  assert.match(output, /Engram initialized/); assert.equal(cortex.chart.summary, ''); assert.deepEqual(cortex.chart.areas, []);
  const skill = await fs.readFile(path.join(root, '.engram/skills/cerebellum/SKILL.md'), 'utf8'); assert.match(skill, /Engram does not scan, parse, or infer facts/);
  assert.match(skill, /node \.engram\/runtime\/bin\/engram\.js/); assert.match(output, /Local runtime/);
  const workflowSkill = await fs.readFile(path.join(root, '.engram/skills/engram-workflow/SKILL.md'), 'utf8'); assert.match(workflowSkill, /Start every task/); assert.match(workflowSkill, /engram\.js doctor/);
  const evidenceReportSkill = await fs.readFile(path.join(root, '.engram/skills/evidence-report/SKILL.md'), 'utf8');
  assert.match(evidenceReportSkill, /Engram evidence report/); assert.match(evidenceReportSkill, /engram\.js evidence/); assert.match(evidenceReportSkill, /polished PDF/);
  const evaluationSkill = await fs.readFile(path.join(root, '.engram/skills/protected-evaluation/SKILL.md'), 'utf8'); assert.match(evaluationSkill, /control\/treatment/); assert.match(evaluationSkill, /container adapter/);
  const evidenceSettings = JSON.parse(await fs.readFile(path.join(root, '.engram/evidence.json'), 'utf8')); assert.equal(evidenceSettings.enabled, true); assert.equal(evidenceSettings.retention.max_events, 2000);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, '.engram/runtime/package.json'), 'utf8')), { private: true, type: 'module' });
  const doctor = JSON.parse(await runInstalled(root, 'doctor')); assert.equal(doctor.status, 'ready'); assert.equal(doctor.checks.every((check) => check.present), true);
  const codexMcp = await runInstalled(root, 'mcp-config', '--host', 'codex'); assert.match(codexMcp, /\[mcp_servers\.engram\]/); assert.match(codexMcp, /engram-mcp\.js/);
  const cursorMcp = JSON.parse(await runInstalled(root, 'mcp-config', '--host', 'cursor')); assert.equal(cursorMcp.mcpServers.engram.command, 'node');
  assert.match(await runInstalled(root, 'bundle', '--output', 'engram-team-bundle.json'), /Bundle written/);
  const bundle = JSON.parse(await fs.readFile(path.join(root, 'engram-team-bundle.json'), 'utf8')); assert.equal(bundle.schema_version, 1); assert.equal(bundle.automatic_evidence.privacy.storage, 'local-only'); assert.equal(Array.isArray(bundle.limitations), true);
  const migration = JSON.parse(await runInstalled(root, 'migrate')); assert.equal(migration.status, 'no_migration_needed'); assert.equal(migration.stored_format_version, 1);
  const installedRead = await runInstalledResult(root, 'read'); assert.match(installedRead.stdout, /"repository"/); assert.doesNotMatch(installedRead.stderr, /MODULE_TYPELESS_PACKAGE_JSON/);
  assert.match(await run(root, 'status'), /Revision:/); assert.match(await run(root, 'validate'), /Valid/);
});

test('focus returns a bounded task-relevant Cortex slice without reading source', async () => {
  const root = await fixture(); await run(root, 'init'); const initial = await readCortexSnapshot(root);
  await applyCortexPatch(root, { expected_revision: initial.revision, patch: { operations: [
    { op: 'upsert', collection: 'areas', item: { id: 'merchant-transaction-update', label: 'Merchant transaction authorization', summary: 'The update route authorizes the application relationship before persistence.', keywords: ['tenant-isolation', 'cross-app'], evidence: ['API/MerchantTransactionController.cs', 'API/MerchantTransactionConverter.cs'] } },
    { op: 'upsert', collection: 'workflows', item: { id: 'release', label: 'Release', summary: 'Runs deployment checks.', keywords: ['deployment'], evidence: ['ci/release.yml'] } }
  ] } });
  const current = await readCortexSnapshot(root); const focused = focusCortex(current, 'tenant-isolation', 1, 1);
  assert.equal(focused.revision, current.revision); assert.equal(focused.matches.length, 1); assert.equal(focused.matches[0].id, 'merchant-transaction-update'); assert.deepEqual(focused.matches[0].matchedTerms, ['tenant-isolation']); assert.deepEqual(focused.evidence_paths, ['API/MerchantTransactionController.cs']); assert.deepEqual(focused.matches[0].evidence, ['API/MerchantTransactionController.cs']); assert.equal(focused.protocol.initial_evidence_limit, 1); assert.match(focused.protocol.correctness_gate[1], /authorized entity/);
  const cliFocus = JSON.parse(await runInstalled(root, 'focus', '--query', 'tenant-isolation', '--limit', '1', '--evidence-limit', '1'));
  assert.equal(cliFocus.matches[0].id, 'merchant-transaction-update');
  assert.throws(() => focusCortex(current, 'merchant', 0), /1 through 50/);
  assert.throws(() => focusCortex(current, 'merchant', 1, 0), /1 through 20/);
});

test('automatic evidence records local CLI and MCP activity without retaining a task prompt', async () => {
  const root = await fixture(); await run(root, 'init');
  const first = await readCortexSnapshot(root);
  await handleMcpRequest({ method: 'tools/call', params: { name: 'engram_apply', arguments: { root, expected_revision: first.revision, patch: { operations: [{ op: 'upsert', collection: 'areas', item: { id: 'orders', label: 'Orders', summary: 'Handles order creation.', keywords: ['order'], evidence: ['src/orders.js'] } }] } } } });
  const secretQuery = 'private customer account 90210';
  await runInstalled(root, 'focus', '--query', secretQuery);
  await handleMcpRequest({ method: 'tools/call', params: { name: 'engram_read', arguments: { root } } });
  await handleMcpRequest({ method: 'tools/call', params: { name: 'engram_focus', arguments: { root, query: 'order' } } });
  const viaMcp = await handleMcpRequest({ method: 'tools/call', params: { name: 'engram_evidence', arguments: { root } } });
  const evidence = await automaticEvidenceSummary(root);
  assert.equal(evidence.status, 'available'); assert.equal(evidence.focus_actions, 2); assert.ok(evidence.events >= 4);
  assert.equal(viaMcp.structuredContent.focus_actions, 2);
  assert.equal(evidence.sources.cli >= 2, true); assert.equal(evidence.sources.mcp >= 2, true);
  assert.equal(evidence.setup.cortex_created, true); assert.equal(evidence.estimated_context_reduction_tokens >= 0, true);
  assert.equal(evidence.privacy.storage, 'local-only'); assert.equal(evidence.privacy.enabled, true);
  assert.equal(evidence.first_cortex.entries, 1); assert.equal(evidence.first_cortex.elapsed_after_setup_ms >= 0, true);
  const raw = await fs.readFile(path.join(root, '.engram/evidence.ndjson'), 'utf8');
  assert.doesNotMatch(raw, new RegExp(secretQuery)); assert.doesNotMatch(raw, /src\/orders\.js/);
  assert.match(await runInstalled(root, 'evidence', '--export', 'engram-evidence-export.json'), /Evidence exported/);
  const exported = JSON.parse(await fs.readFile(path.join(root, 'engram-evidence-export.json'), 'utf8'));
  assert.equal(exported.privacy.storage, 'local-only'); assert.doesNotMatch(JSON.stringify(exported), new RegExp(secretQuery));
  const beforeOptOut = await fs.readFile(path.join(root, '.engram/evidence.ndjson'), 'utf8');
  await fs.writeFile(path.join(root, '.engram/evidence.json'), JSON.stringify({ version: 1, enabled: false, retention: { max_events: 2000, max_bytes: 1048576 } }));
  await runInstalled(root, 'read');
  assert.equal(await fs.readFile(path.join(root, '.engram/evidence.ndjson'), 'utf8'), beforeOptOut);
  assert.equal((await automaticEvidenceSummary(root)).privacy.enabled, false);
});

test('focus spreads its evidence budget across top matches before expanding one match', async () => {
  const root = await fixture(); await run(root, 'init'); const initial = await readCortexSnapshot(root);
  await applyCortexPatch(root, { expected_revision: initial.revision, patch: { operations: [
    { op: 'upsert', collection: 'areas', item: { id: 'first', label: 'Shared concern', summary: 'First durable concern.', keywords: ['shared'], evidence: ['src/first.js', 'src/first-detail.js'] } },
    { op: 'upsert', collection: 'workflows', item: { id: 'second', label: 'Shared workflow', summary: 'Second durable concern.', keywords: ['shared'], evidence: ['src/second.js', 'src/second-detail.js'] } }
  ] } });
  const focused = focusCortex(await readCortexSnapshot(root), 'shared', 2, 3);
  assert.deepEqual(focused.evidence_paths, ['src/first.js', 'src/second.js', 'src/first-detail.js']);
});

test('validation rejects malformed or duplicate retrieval keywords', () => {
  const malformed = chart('product'); malformed.chart.areas = [{ id: 'security', label: 'Security', summary: 'Guards tenant data.', keywords: ['Tenant', 'tenant'] }];
  assert.throws(() => validateCortex(malformed), /keywords has duplicates/);
  malformed.chart.areas[0].keywords = ['x'.repeat(129)];
  assert.throws(() => validateCortex(malformed), /keyword exceeds/);
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

test('a failed history append leaves a recoverable pending transaction instead of an untracked Cortex revision', async () => {
  const root = await fixture(); await run(root, 'init'); const initial = await readCortexSnapshot(root);
  const historyFile = path.join(root, '.engram/history/events.ndjson');
  await fs.mkdir(historyFile, { recursive: true });
  const patch = { operations: [{ op: 'upsert', collection: 'areas', item: { id: 'recoverable', label: 'Recoverable', summary: 'History must catch up after failure.' } }] };
  await assert.rejects(applyCortexPatch(root, { expected_revision: initial.revision, patch, history: true }), /EISDIR|illegal operation/i);
  const changed = await readCortexSnapshot(root);
  assert.notEqual(changed.revision, initial.revision);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, '.engram/history/pending.json'), 'utf8')).before_revision, initial.revision);
  await fs.rm(historyFile, { recursive: true });
  const verified = await verifyCortexHistory(root);
  assert.deepEqual(verified, { valid: true, events: 1, snapshots: 1, revision: changed.revision });
  assert.deepEqual((await recoverHistory(root)).cortex, changed.cortex);
  await assert.rejects(fs.access(path.join(root, '.engram/history/pending.json')), /ENOENT/);
});

test('replace history replays the normalized stored Cortex', async () => {
  const root = await fixture(); await run(root, 'init'); const initial = await readCortexSnapshot(root);
  const replacement = { repository: { name: 'replacement' }, chart: { summary: 'Replacement Cortex.', areas: [], workflows: [], decisions: [], conventions: [] } };
  const changed = await replaceCortex(root, { expected_revision: initial.revision, cortex: replacement, history: true });
  assert.deepEqual((await recoverHistory(root)).cortex, changed.cortex);
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

test('a lock left by a dead process is recovered before a Cortex mutation', async () => {
  const root = await fixture(); await run(root, 'init'); const initial = await readCortexSnapshot(root);
  const lock = path.join(root, '.engram/cortex.lock');
  await fs.writeFile(lock, `${JSON.stringify({ version: 1, pid: 99999999, created_at: '2020-01-01T00:00:00.000Z' })}\n`);
  const changed = await applyCortexPatch(root, { expected_revision: initial.revision, patch: { operations: [{ op: 'upsert', collection: 'areas', item: { id: 'recovered', label: 'Recovered', summary: 'Mutation proceeds after a dead writer.' } }] } });
  assert.equal(changed.cortex.chart.areas[0].id, 'recovered');
  await assert.rejects(fs.access(lock), { code: 'ENOENT' });
});

test('active and malformed lock files remain busy and are never removed', async () => {
  const root = await fixture(); await run(root, 'init'); const lock = path.join(root, '.engram/cortex.lock');
  const active = `${JSON.stringify({ version: 1, pid: process.pid, created_at: new Date().toISOString() })}\n`;
  await fs.writeFile(lock, active);
  await assert.rejects(withCortexLock(root, async () => {}), (error) => error.code === 'CORTEX_BUSY');
  assert.equal(await fs.readFile(lock, 'utf8'), active);
  const malformed = 'not lock metadata\n'; await fs.writeFile(lock, malformed);
  await assert.rejects(withCortexLock(root, async () => {}), (error) => error.code === 'CORTEX_BUSY');
  assert.equal(await fs.readFile(lock, 'utf8'), malformed);
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
  const focused = await handleMcpRequest({ method: 'tools/call', params: { name: 'engram_focus', arguments: { root, query: 'compact' } } });
  assert.equal(focused.structuredContent.matches[0].id, 'compact'); assert.equal(focused.structuredContent.protocol.initial_evidence_limit, 5);
  await assert.rejects(handleMcpRequest({ method: 'tools/call', params: { name: 'engram_apply', arguments: { root, expected_revision: first.revision, patch: { operations: [] } } } }), (error) => error.code === 'REVISION_CONFLICT' && error.current.revision === applied.structuredContent.revision);
});

test('the MCP stdio server handles initialize and tools/list without process restart', async () => {
  const child = spawn(process.execPath, [mcpBin], { stdio: ['pipe', 'pipe', 'pipe'] }); let buffered = ''; const responses = new Map();
  child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { buffered += chunk; let newline; while ((newline = buffered.indexOf('\n')) >= 0) { const line = buffered.slice(0, newline); buffered = buffered.slice(newline + 1); const message = JSON.parse(line); responses.get(message.id)?.(message); } });
  const request = (id, method, params = {}) => new Promise((resolve) => { responses.set(id, resolve); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
  const initialized = await request(1, 'initialize', { protocolVersion: '2024-11-05' }); const listed = await request(2, 'tools/list'); child.kill();
  assert.equal(initialized.result.serverInfo.name, 'engram'); assert.equal(listed.result.tools.find((tool) => tool.name === 'engram_apply').inputSchema.required.includes('expected_revision'), true);
  assert.ok(listed.result.tools.find((tool) => tool.name === 'engram_evidence'));
});
