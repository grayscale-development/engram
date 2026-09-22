import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from './indexer.js';
import { loadGraph, saveGraph } from './storage.js';
import { applyDelta, readDelta } from './semantic.js';
import { contextPacket, rank } from './query.js';
import { overview, status, stats } from './report.js';
import { git } from './utils.js';
import { GRAPH_PATH } from './constants.js';

const help = `Graph-AI — local repository intelligence\n\nCommands:\n  init [--root path]                 create .ai/graph\n  build [--root path]                update structural graph\n  overview [--root path]             compact orientation\n  context <task> [--tokens n]        task-specific context packet\n  query <terms> [--json]             targeted knowledge search\n  inspect [file|concept|practice] <value>\n  add <type> <statement> [--evidence a,b]\n  sync [--input delta.json|-]        build plus agent semantic delta\n  status | stats                     freshness and compression\n\nSemantic delta: { "changes": [{ "type": "product.concept", "label": "Saved card selection", "statement": "Users can reuse saved cards at checkout.", "evidence": ["src/checkout.js"] }] }`;
function option(args, name, fallback = null) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; }
function rootFor(args) { return path.resolve(option(args, '--root', process.cwd())); }
function positional(args) { const flags = new Set(['--root', '--tokens', '--input', '--evidence']); return args.filter((a, i) => !a.startsWith('--') && !flags.has(args[i - 1])); }
async function requireGraph(root) { const graph = await loadGraph(root); if (!graph) throw new Error(`no ${GRAPH_PATH}; run graph-ai init first`); return graph; }
function jsonOrText(value, args) { process.stdout.write(`${args.includes('--json') ? JSON.stringify(value, null, 2) : value}\n`); }
export async function run(args) {
  const command = args[0]; const root = rootFor(args);
  if (!command || ['help', '--help', '-h'].includes(command)) return process.stdout.write(`${help}\n`);
  if (command === 'init' || command === 'build') {
    const prior = command === 'build' ? await requireGraph(root) : await loadGraph(root);
    const { graph, summary } = await build(root, prior); graph.repository.name = path.basename(root); await saveGraph(root, graph);
    process.stdout.write(`Graph-AI ${command === 'init' ? 'initialized' : 'updated'}.\nFiles indexed: ${Object.keys(graph.files).length}\nSymbols/nodes: ${Object.keys(graph.nodes).length}\nRelationships: ${graph.edges.length}\nAdded: ${summary.added.length} · Modified: ${summary.modified.length} · Deleted: ${summary.deleted.length}\nAffected semantic knowledge: ${summary.stale}\nCreated: ${GRAPH_PATH}\n`); return;
  }
  const graph = await requireGraph(root);
  if (command === 'overview') return jsonOrText(overview(graph), args);
  if (command === 'context') { const task = positional(args).slice(1).join(' '); if (!task) throw new Error('context requires a task'); const packet = contextPacket(graph, task, Number(option(args, '--tokens', '2000'))); return jsonOrText(args.includes('--json') ? packet : packet.text, args); }
  if (command === 'query') { const query = positional(args).slice(1).join(' '); if (!query) throw new Error('query requires terms'); const result = rank(graph, query).slice(0, 12).map(({ node, score }) => ({ score, id: node.id, type: node.type, label: node.label, statement: node.statement, status: node.status, evidence: node.evidence })); return jsonOrText(args.includes('--json') ? result : result.map((n) => `${n.type}: ${n.label}${n.statement ? `\n  ${n.statement}` : ''}${n.status ? ` [${n.status}]` : ''}`).join('\n'), args); }
  if (command === 'inspect') { const parts = positional(args).slice(1); const needle = parts.slice(1).join(' ') || parts[0]; const found = Object.values(graph.nodes).filter((n) => n.id.includes(needle) || n.label.toLowerCase().includes(needle.toLowerCase()) || n.type.includes(parts[0] || '')).slice(0, 15); return jsonOrText(args.includes('--json') ? found : found.map((n) => `${n.id}\n  type: ${n.type}\n  source: ${n.source}/${n.authority}\n  statement: ${n.statement || '—'}\n  evidence: ${(n.evidence || []).join(', ') || '—'}\n  status: ${n.status || 'current'}`).join('\n'), args); }
  if (command === 'add') { const parts = positional(args).slice(1); const type = parts.shift(); const statement = parts.join(' '); if (!type || !statement) throw new Error('usage: graph-ai add <type> <statement> [--evidence a,b]'); const evidence = (option(args, '--evidence', '') || '').split(',').filter(Boolean); const result = applyDelta(graph, { changes: [{ type: `practice.${type}`, label: statement.slice(0, 64), statement, evidence }] }, 'human'); await saveGraph(root, graph); process.stdout.write(`Added canonical knowledge: ${result.applied}\n`); return; }
  if (command === 'sync') { const { graph: updated, summary } = await build(root, graph); const input = option(args, '--input'); const delta = await readDelta(input && input !== '-' ? path.resolve(root, input) : input); const result = applyDelta(updated, delta, 'agent'); await saveGraph(root, updated); process.stdout.write(`Structural graph updated.\nChanged files: ${summary.added.length + summary.modified.length + summary.deleted.length}\nSemantic updates applied: ${result.applied}\nPotentially stale knowledge: ${summary.stale}\n${result.warnings.length ? `Warnings: ${result.warnings.join('; ')}\n` : ''}${GRAPH_PATH} updated.\n`); return; }
  if (command === 'status') return process.stdout.write(`${status(graph, await git(root, ['rev-parse', 'HEAD']), Boolean(await git(root, ['status', '--porcelain']))) }\n`);
  if (command === 'stats') { const size = (await fs.stat(path.join(root, GRAPH_PATH))).size; return process.stdout.write(`${stats(graph, size)}\n`); }
  throw new Error(`unknown command: ${command}`);
}
