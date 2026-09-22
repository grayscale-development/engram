import { scan } from './scanner.js';
import { parseFile } from './parser.js';
import { emptyGraph } from './storage.js';
import { git, slug } from './utils.js';

const fileId = (p) => `code:file:${p}`;
const symbolId = (p, name) => `code:symbol:${p}#${name}`;
function codeNodesFor(file) {
  const id = fileId(file.path); const parsed = parseFile(file);
  // Declarations/endpoints are nodes, so file metadata intentionally avoids duplicating them.
  const nodes = { [id]: { id, type: 'code.file', label: file.path, source: 'parser', authority: 'derived', evidence: [file.path], metadata: { language: file.language, import_count: parsed.imports.length, test: parsed.test, keywords: parsed.keywords } } };
  const edges = [];
  for (const symbol of parsed.symbols) { const sid = symbolId(file.path, symbol.name); nodes[sid] = { id: sid, type: `code.${symbol.kind}`, label: symbol.name, source: 'parser', authority: 'derived', evidence: [file.path], metadata: symbol }; edges.push({ type: 'declares', from: id, to: sid }); }
  for (const endpoint of parsed.endpoints) { const eid = `code:endpoint:${endpoint.method}:${endpoint.path}`; nodes[eid] ||= { id: eid, type: 'code.endpoint', label: `${endpoint.method} ${endpoint.path}`, source: 'parser', authority: 'derived', evidence: [file.path], metadata: endpoint }; edges.push({ type: 'exposes', from: id, to: eid }); }
  return { nodes, edges, parsed };
}
function resolveImport(from, spec, files) {
  if (!spec.startsWith('.')) return null;
  const base = from.split('/').slice(0, -1).join('/'); const clean = `${base}/${spec}`.replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\./g, '/');
  const choices = [clean, ...['.ts','.tsx','.js','.jsx','.mjs','.py'].map((x) => clean + x), ...['/index.ts','/index.js'].map((x) => clean + x)];
  return choices.find((p) => files[p]);
}
export async function build(root, prior = null) {
  const graph = prior || emptyGraph(root); const scanned = await scan(root); const next = Object.fromEntries(scanned.map((f) => [f.path, f]));
  const before = graph.files || {}; const added = []; const modified = []; const unchanged = []; const deleted = Object.keys(before).filter((p) => !next[p]);
  for (const [p, f] of Object.entries(next)) !before[p] ? added.push(p) : before[p].hash === f.hash ? unchanged.push(p) : modified.push(p);
  const changed = new Set([...added, ...modified, ...deleted]);
  // Recreate parser-owned content deterministically; semantic content survives.
  for (const [id, node] of Object.entries(graph.nodes)) if (node.source === 'parser') delete graph.nodes[id];
  graph.edges = graph.edges.filter((edge) => !String(edge.type).startsWith('declares') && edge.type !== 'imports' && edge.type !== 'exposes');
  graph.files = {};
  for (const f of scanned) { graph.files[f.path] = { hash: f.hash, size: f.size, language: f.language }; const indexed = codeNodesFor(f); Object.assign(graph.nodes, indexed.nodes); graph.edges.push(...indexed.edges); }
  for (const f of scanned) { const parsed = parseFile(f); for (const spec of parsed.imports) { const target = resolveImport(f.path, spec, graph.files); if (target) graph.edges.push({ type: 'imports', from: fileId(f.path), to: fileId(target) }); } }
  const semantic = Object.values(graph.nodes).filter((node) => node.source !== 'parser'); let stale = 0;
  for (const node of semantic) {
    if (node.authority === 'canonical') continue;
    const affected = (node.evidence || []).filter((p) => changed.has(p));
    if (affected.length) { node.status = 'possibly_stale'; node.stale_reason = affected.map((p) => deleted.includes(p) ? `${p} deleted` : `${p} changed`).join('; '); stale++; }
  }
  graph.repository.indexed_at = new Date().toISOString(); graph.repository.indexed_revision = await git(root, ['rev-parse', 'HEAD']);
  graph.generator_version = '0.1.0';
  return { graph, summary: { added, modified, deleted, unchanged, stale } };
}
export function semanticId(type, label) { return `${type}:${slug(label)}`; }
