import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build, freshness } from '../src/indexer.js';
import { saveGraph, loadGraph } from '../src/storage.js';
import { applyDelta } from '../src/semantic.js';
import { contextPacket } from '../src/query.js';
import { evaluateFixture } from '../src/evaluate.js';
import { previewDiff } from '../src/diff.js';
import { parseFile } from '../src/parser.js';
import { runBenchmark } from '../src/benchmark.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-ai-'));
  await fs.mkdir(path.join(root, 'src')); await fs.mkdir(path.join(root, 'tests'));
  await fs.writeFile(path.join(root, '.gitignore'), 'ignored.js\n.env\n');
  await fs.writeFile(path.join(root, 'src', 'cards.js'), "export function selectSavedCard(card) { return card.id; }\n");
  await fs.writeFile(path.join(root, 'src', 'checkout.js'), "import { selectSavedCard } from './cards.js';\nexport const checkout = selectSavedCard;\n");
  await fs.writeFile(path.join(root, 'tests', 'checkout.spec.js'), "import { checkout } from '../src/checkout.js';\n");
  await fs.writeFile(path.join(root, 'ignored.js'), 'secret-ish'); await fs.writeFile(path.join(root, '.env'), 'TOKEN=nope');
  return root;
}
test('builds structural graph, respects ignores, and preserves import relationship', async () => {
  const root = await fixture(); const { graph } = await build(root);
  assert.ok(graph.files['src/checkout.js']); assert.equal(graph.files['ignored.js'], undefined); assert.equal(graph.files['.env'], undefined);
  assert.ok(graph.nodes['code:symbol:src/cards.js#selectSavedCard']);
  assert.ok(graph.edges.some((e) => e.type === 'imports' && e.from.endsWith('checkout.js') && e.to.endsWith('cards.js')));
  const graphFile = path.join(root, '.ai', 'graph'); await fs.mkdir(path.dirname(graphFile), { recursive: true }); await fs.writeFile(graphFile, JSON.stringify(graph)); assert.equal((await loadGraph(root)).format_version, 3);
  await saveGraph(root, graph); assert.equal((await loadGraph(root)).format_version, 3); const raw = await fs.readFile(graphFile); assert.equal(raw[0], 0x1f); await saveGraph(root, graph); assert.deepEqual(await fs.readFile(graphFile), raw);
});
test('tree-sitter adapters extract JavaScript, TypeScript, and Python structure', () => {
  const js = parseFile({ path: 'src/widget.js', language: 'JavaScript', content: "import { helper } from './helper.js'; export class Widget {} export function render() { return helper(); } router.get('/widgets', render);" });
  const ts = parseFile({ path: 'src/types.ts', language: 'TypeScript', content: "export interface Loan { id: string }; export const load = () => 1;" });
  const py = parseFile({ path: 'app/tasks.py', language: 'Python', content: 'from app.auth import permit\nclass Task:\n    def complete(self):\n        return permit()\n' });
  assert.equal(js.parser, 'tree-sitter'); assert.deepEqual(js.imports, ['./helper.js']); assert.ok(js.symbols.some((s) => s.name === 'Widget')); assert.ok(js.calls.includes('helper')); assert.deepEqual(js.endpoints, [{ method: 'GET', path: '/widgets' }]);
  assert.equal(ts.parser, 'tree-sitter'); assert.ok(ts.symbols.some((s) => s.name === 'Loan')); assert.ok(ts.symbols.some((s) => s.name === 'load'));
  assert.equal(py.parser, 'tree-sitter'); assert.ok(py.symbols.some((s) => s.name === 'Task')); assert.ok(py.symbols.some((s) => s.name === 'complete')); assert.ok(py.calls.includes('permit'));
});
test('generic repository orientation recommends conventional entry points', async () => {
  const root = await fixture(); await fs.writeFile(path.join(root, 'README.md'), '# Checkout\n'); await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'checkout' })); await fs.mkdir(path.join(root, 'app')); await fs.writeFile(path.join(root, 'app', 'router.js'), 'export default {}');
  const { graph } = await build(root); const packet = contextPacket(graph, 'tell me about this repo', 2000);
  assert.deepEqual(packet.files, ['README.md', 'package.json', 'app/router.js']);
  assert.match(packet.text, /REPOSITORY OVERVIEW/);
});
test('falls back to regex extraction when Tree-sitter declines a large source file', () => {
  const content = `${'// padding\n'.repeat(3_300)}export function largeFileHelper() { return true; }`;
  const parsed = parseFile({ path: 'src/large-file.js', language: 'JavaScript', content });
  assert.equal(parsed.parser, 'regex');
  assert.ok(parsed.symbols.some((symbol) => symbol.name === 'largeFileHelper'));
});
test('resolves TypeScript aliases, local packages, barrels, and Python modules', async () => {
  const root = await fixture();
  await fs.writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@app/*': ['src/*'] } } }));
  await fs.mkdir(path.join(root, 'src', 'shared')); await fs.writeFile(path.join(root, 'src', 'shared', 'index.ts'), 'export const helper = 1;'); await fs.writeFile(path.join(root, 'src', 'alias.ts'), "import { helper } from '@app/shared'; export const value = helper;");
  await fs.mkdir(path.join(root, 'packages', 'core', 'src'), { recursive: true }); await fs.writeFile(path.join(root, 'packages', 'core', 'package.json'), JSON.stringify({ name: '@acme/core' })); await fs.writeFile(path.join(root, 'packages', 'core', 'src', 'index.ts'), 'export const core = 1;'); await fs.writeFile(path.join(root, 'src', 'package.ts'), "import { core } from '@acme/core'; export const value = core;");
  await fs.mkdir(path.join(root, 'app')); await fs.writeFile(path.join(root, 'app', 'permissions.py'), 'def permit(): return True\n'); await fs.writeFile(path.join(root, 'app', 'service.py'), 'from app.permissions import permit\npermit()\n');
  const { graph } = await build(root); const imports = graph.edges.filter((edge) => edge.type === 'imports').map((edge) => `${edge.from}->${edge.to}`);
  assert.ok(imports.some((edge) => edge.endsWith('alias.ts->code:file:src/shared/index.ts'))); assert.ok(imports.some((edge) => edge.endsWith('package.ts->code:file:packages/core/src/index.ts'))); assert.ok(imports.some((edge) => edge.endsWith('service.py->code:file:app/permissions.py')));
});
test('semantic delta is traceable, appears in context, and becomes stale after evidence changes', async () => {
  const root = await fixture(); let { graph } = await build(root);
  const result = applyDelta(graph, { changes: [{ type: 'product.concept', label: 'Saved card selection', statement: 'Customers can reuse a saved payment method at checkout.', evidence: ['src/cards.js'], related: ['code:file:src/checkout.js'] }] });
  assert.equal(result.applied, 1); const packet = contextPacket(graph, 'fix saved card checkout', 400); assert.match(packet.text, /Customers can reuse/); assert.ok(packet.tokens <= 400);
  await fs.writeFile(path.join(root, 'src', 'cards.js'), "export function selectSavedCard(card) { return card.token; }\n");
  ({ graph } = await build(root, graph)); const node = Object.values(graph.nodes).find((n) => n.label === 'Saved card selection'); assert.equal(node.status, 'possibly_stale');
});
test('deleting semantic evidence leaves knowledge inspectable and stale', async () => {
  const root = await fixture(); let { graph } = await build(root);
  applyDelta(graph, { changes: [{ type: 'decision.compatibility', label: 'Saved cards compatibility', statement: 'Saved-card handling has a compatibility path.', evidence: ['src/cards.js'] }] });
  await fs.unlink(path.join(root, 'src', 'cards.js')); ({ graph } = await build(root, graph));
  const node = Object.values(graph.nodes).find((n) => n.label === 'Saved cards compatibility'); assert.equal(node.status, 'possibly_stale'); assert.match(node.stale_reason, /deleted/);
});
test('content-identical evidence renames preserve verified semantic knowledge', async () => {
  const root = await fixture(); let { graph } = await build(root); applyDelta(graph, { changes: [{ type: 'product.concept', label: 'Card selection', statement: 'Cards can be selected.', evidence: ['src/cards.js'], related: ['code:file:src/cards.js'] }] });
  await fs.rename(path.join(root, 'src', 'cards.js'), path.join(root, 'src', 'payment-cards.js')); const result = await build(root, graph); const node = result.graph.nodes['product.concept:card-selection'];
  assert.deepEqual(result.summary.renamed, [{ from: 'src/cards.js', to: 'src/payment-cards.js' }]); assert.equal(node.status, 'verified'); assert.deepEqual(node.evidence, ['src/payment-cards.js']); assert.deepEqual(node.related, ['code:file:src/payment-cards.js']);
});
test('canonical knowledge is protected from agent overwrite', async () => {
  const root = await fixture(); const { graph } = await build(root);
  applyDelta(graph, { changes: [{ type: 'practice.frontend', label: 'React only', statement: 'New UI uses React.' }] }, 'human');
  const attempt = applyDelta(graph, { changes: [{ type: 'practice.frontend', label: 'React only', statement: 'New UI uses Ember.' }] }, 'agent');
  assert.equal(attempt.applied, 0); assert.match(attempt.warnings[0], /protected canonical/);
});
test('semantic knowledge supports scope and flags canonical contradictions', async () => {
  const root = await fixture(); const { graph } = await build(root);
  applyDelta(graph, { changes: [{ type: 'practice.frontend', label: 'React UI', statement: 'New UI must use React components.', scope: 'frontend' }] }, 'human');
  const result = applyDelta(graph, { changes: [{ type: 'practice.frontend', label: 'Ember UI', statement: 'New UI must not use React components.', scope: 'frontend' }] });
  assert.equal(graph.nodes['practice.frontend:react-ui'].scope, 'frontend'); assert.match(result.warnings.join('\n'), /potential contradiction/);
});
test('documents produce section symbols and classified file metadata', async () => {
  const root = await fixture(); await fs.writeFile(path.join(root, 'AGENTS.md'), '# Rules\n\n## Frontend\nUse React.\n'); const { graph } = await build(root);
  assert.equal(graph.nodes['code:file:AGENTS.md'].metadata.kind, 'agent-guidance'); assert.ok(Object.values(graph.nodes).some((node) => node.type === 'code.section' && node.label === 'Frontend'));
});
test('agent deltas can verify and delete non-canonical knowledge', async () => {
  const root = await fixture(); const { graph } = await build(root);
  applyDelta(graph, { changes: [{ type: 'product.concept', label: 'Saved cards', statement: 'Saved cards are selectable.' }] });
  const id = 'product.concept:saved-cards'; graph.nodes[id].status = 'possibly_stale';
  assert.equal(applyDelta(graph, { changes: [{ action: 'verify', id }] }).applied, 1); assert.equal(graph.nodes[id].status, 'verified');
  assert.equal(applyDelta(graph, { changes: [{ action: 'delete', id }] }).applied, 1); assert.equal(graph.nodes[id], undefined);
});
test('incremental build only reparses changed files', async () => {
  const root = await fixture(); let result = await build(root); assert.equal(result.summary.parsed, 4);
  result = await build(root, result.graph); assert.equal(result.summary.parsed, 0);
  await fs.writeFile(path.join(root, 'src', 'cards.js'), 'export const selectSavedCard = (card) => card.token;\n');
  result = await build(root, result.graph); assert.equal(result.summary.parsed, 1);
});
test('freshness reports exact added, modified, and deleted paths', async () => {
  const root = await fixture(); const { graph } = await build(root);
  await fs.writeFile(path.join(root, 'src', 'cards.js'), 'changed'); await fs.unlink(path.join(root, 'tests', 'checkout.spec.js')); await fs.writeFile(path.join(root, 'src', 'new.js'), 'export const fresh = true;');
  const result = await freshness(root, graph); assert.deepEqual(result.modified, ['src/cards.js']); assert.deepEqual(result.deleted, ['tests/checkout.spec.js']); assert.deepEqual(result.added, ['src/new.js']);
});
test('loan fulfillment evaluation maintains useful compact context', async () => {
  const result = await evaluateFixture(path.resolve('examples/loan-fulfillment'));
  assert.equal(result.mean_file_recall, 1); assert.equal(result.mean_fact_recall, 1); assert.ok(result.mean_file_precision >= 0.7); assert.equal(result.mutation_pass_rate, 1); assert.ok(result.mean_tokens <= 250); assert.ok(result.tasks.every((task) => task.files.length <= 3));
});
test('organization access evaluation rejects unrelated tasks', async () => {
  const result = await evaluateFixture(path.resolve('examples/organization-access'));
  assert.equal(result.mean_file_recall, 1); assert.equal(result.mean_fact_recall, 1); assert.equal(result.negative_pass_rate, 1); assert.ok(result.mean_file_precision >= 0.7); assert.ok(result.tasks.every((task) => task.files.length <= 3));
});
test('diff previews structural and semantic impact without mutating the graph', async () => {
  const root = await fixture(); const { graph } = await build(root); applyDelta(graph, { changes: [{ type: 'product.concept', label: 'Card handling', statement: 'Cards are handled.', evidence: ['src/cards.js'] }] });
  await fs.writeFile(path.join(root, 'src', 'cards.js'), 'export const cards = [];\n'); const diff = await previewDiff(root, graph);
  assert.deepEqual(diff.files.modified, ['src/cards.js']); assert.equal(diff.semantic.newly_stale[0].label, 'Card handling'); assert.equal(graph.nodes['product.concept:card-handling'].status, 'verified');
});
test('benchmark demonstrates hash-selected incremental parsing', async () => {
  const result = await runBenchmark(20); assert.equal(result.initial.parsed, 21); assert.deepEqual(result.updates.map((update) => update.parsed), [0, 1, 1, 20]); assert.ok(result.graph_bytes > 0);
});
test('CLI lifecycle initializes, learns, retrieves, previews, and exports', async () => {
  const root = await fixture(); const cli = path.resolve('bin/graph-ai.js');
  const run = async (...args) => (await exec(process.execPath, [cli, ...args, '--root', root])).stdout;
  const initialized = await run('init'); assert.match(initialized, /Graph-AI initialized/); assert.match(initialized, /Created: CLAUDE\.md/);
  assert.match(await fs.readFile(path.join(root, 'CLAUDE.md'), 'utf8'), /Repository orientation/);
  assert.match(await fs.readFile(path.join(root, 'CLAUDE.md'), 'utf8'), /PACKET/);
  await fs.writeFile(path.join(root, 'delta.json'), JSON.stringify({ changes: [{ type: 'product.concept', label: 'Saved card reuse', statement: 'Customers can reuse saved cards at checkout.', evidence: ['src/cards.js'] }] }));
  assert.match(await run('sync', '--input', 'delta.json'), /Updated: Graph-AI block in CLAUDE\.md/);
  assert.match(await run('context', 'fix saved card checkout', '--tokens', '300'), /Customers can reuse/);
  assert.match(await run('diff'), /Graph would change: no/);
  const exported = path.join(root, 'exported.json'); assert.match(await run('export', '--output', exported), /Exported readable graph/); assert.equal(JSON.parse(await fs.readFile(exported, 'utf8')).format_version, 3);
});
test('sync does not create Claude guidance when init did not create it', async () => {
  const root = await fixture(); const cli = path.resolve('bin/graph-ai.js'); const { graph } = await build(root); await saveGraph(root, graph);
  await fs.writeFile(path.join(root, 'delta.json'), JSON.stringify({ changes: [] }));
  await exec(process.execPath, [cli, 'sync', '--input', 'delta.json', '--root', root]);
  await assert.rejects(fs.access(path.join(root, 'CLAUDE.md')));
});
