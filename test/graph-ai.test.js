import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from '../src/indexer.js';
import { saveGraph, loadGraph } from '../src/storage.js';
import { applyDelta } from '../src/semantic.js';
import { contextPacket } from '../src/query.js';

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
  await saveGraph(root, graph); assert.equal((await loadGraph(root)).format_version, 1);
});
test('semantic delta is traceable, appears in context, and becomes stale after evidence changes', async () => {
  const root = await fixture(); let { graph } = await build(root);
  const result = applyDelta(graph, { changes: [{ type: 'product.concept', label: 'Saved card selection', statement: 'Customers can reuse a saved payment method at checkout.', evidence: ['src/cards.js'], related: ['code:file:src/checkout.js'] }] });
  assert.equal(result.applied, 1); const packet = contextPacket(graph, 'fix saved card checkout', 400); assert.match(packet.text, /Customers can reuse/);
  await fs.writeFile(path.join(root, 'src', 'cards.js'), "export function selectSavedCard(card) { return card.token; }\n");
  ({ graph } = await build(root, graph)); const node = Object.values(graph.nodes).find((n) => n.label === 'Saved card selection'); assert.equal(node.status, 'possibly_stale');
});
test('canonical knowledge is protected from agent overwrite', async () => {
  const root = await fixture(); const { graph } = await build(root);
  applyDelta(graph, { changes: [{ type: 'practice.frontend', label: 'React only', statement: 'New UI uses React.' }] }, 'human');
  const attempt = applyDelta(graph, { changes: [{ type: 'practice.frontend', label: 'React only', statement: 'New UI uses Ember.' }] }, 'agent');
  assert.equal(attempt.applied, 0); assert.match(attempt.warnings[0], /protected canonical/);
});
