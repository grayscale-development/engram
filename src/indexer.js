import { scan } from './scanner.js';
import { parseFile } from './parser.js';
import { emptyGraph } from './storage.js';
import { git, slug } from './utils.js';

const fileId = (p) => `code:file:${p}`;
const symbolId = (p, name) => `code:symbol:${p}#${name}`;
function fileKind(filePath) {
  const base = filePath.split('/').at(-1).toLowerCase();
  if (base === 'agents.md') return 'agent-guidance'; if (base === 'readme.md') return 'readme'; if (base === 'contributing.md') return 'contributing';
  if (/^adr|decision/.test(base) || filePath.toLowerCase().includes('/adr/')) return 'architecture-decision';
  if (base === 'package.json') return 'package-manifest'; if (filePath.startsWith('.github/workflows/')) return 'ci-workflow'; if (/migrations?\//i.test(filePath)) return 'migration';
  return null;
}
function codeNodesFor(file) {
  const id = fileId(file.path); const parsed = parseFile(file);
  // Declarations/endpoints are nodes, so file metadata intentionally avoids duplicating them.
  const nodes = { [id]: { id, type: 'code.file', label: file.path, source: 'parser', authority: 'derived', evidence: [file.path], metadata: { language: file.language, kind: fileKind(file.path), parser: parsed.parser, import_count: parsed.imports.length, calls: parsed.calls, test: parsed.test, keywords: parsed.keywords } } };
  const edges = [];
  for (const symbol of parsed.symbols) { const sid = symbolId(file.path, symbol.name); nodes[sid] = { id: sid, type: `code.${symbol.kind}`, label: symbol.name, source: 'parser', authority: 'derived', evidence: [file.path], metadata: symbol }; edges.push({ type: 'declares', from: id, to: sid }); }
  for (const endpoint of parsed.endpoints) { const eid = `code:endpoint:${endpoint.method}:${endpoint.path}`; nodes[eid] ||= { id: eid, type: 'code.endpoint', label: `${endpoint.method} ${endpoint.path}`, source: 'parser', authority: 'derived', evidence: [file.path], metadata: endpoint }; edges.push({ type: 'exposes', from: id, to: eid }); }
  return { nodes, edges, parsed };
}
function sourceChoices(base) { return [base, ...['.ts','.tsx','.js','.jsx','.mjs','.py'].map((x) => base + x), ...['/index.ts','/index.js','/__init__.py'].map((x) => base + x)]; }
function resolveImport(from, spec, files, language, config) {
  let bases = [];
  if (spec.startsWith('.')) { const base = from.split('/').slice(0, -1).join('/'); bases = [`${base}/${spec}`.replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\./g, '/')]; }
  else if (language === 'Python') bases = [spec.replace(/\./g, '/')];
  else {
    for (const [pattern, replacements] of Object.entries(config.aliases)) {
      const prefix = pattern.replace(/\*$/, ''); if (!spec.startsWith(prefix)) continue;
      const suffix = spec.slice(prefix.length); for (const replacement of replacements) bases.push(replacement.replace(/\*$/, suffix));
    }
    if (config.packages[spec]) bases.push(config.packages[spec]);
  }
  const choices = bases.flatMap(sourceChoices);
  return choices.find((p) => files[p]);
}
function resolverConfig(scanned) {
  const aliases = {}; const packages = {};
  for (const file of scanned) {
    if (file.path.endsWith('tsconfig.json') || file.path.endsWith('jsconfig.json')) {
      try { const config = JSON.parse(file.content); const base = (config.compilerOptions?.baseUrl || '.').replace(/^\.\/?/, ''); for (const [pattern, paths] of Object.entries(config.compilerOptions?.paths || {})) aliases[pattern] = paths.map((target) => `${base ? `${base}/` : ''}${target}`.replace(/^\//, '')); } catch { /* malformed config remains safely ignored */ }
    }
    if (file.path.endsWith('package.json')) {
      try { const name = JSON.parse(file.content).name; if (name) { const dir = file.path.split('/').slice(0, -1).join('/'); packages[name] = `${dir ? `${dir}/` : ''}src/index`; } } catch { /* malformed manifests remain safely ignored */ }
    }
  }
  return { aliases, packages };
}
export async function build(root, prior = null) {
  const graph = prior || emptyGraph(root); const scanned = await scan(root); const next = Object.fromEntries(scanned.map((f) => [f.path, f]));
  const before = graph.files || {}; const added = []; const modified = []; const unchanged = []; const deleted = Object.keys(before).filter((p) => !next[p]);
  for (const [p, f] of Object.entries(next)) !before[p] ? added.push(p) : before[p].hash === f.hash ? unchanged.push(p) : modified.push(p);
  const changed = new Set([...added, ...modified, ...deleted]);
  const deletedByHash = new Map(deleted.map((p) => [before[p].hash, p])); const renamed = [];
  for (const p of added) { const from = deletedByHash.get(next[p].hash); if (from) renamed.push({ from, to: p }); }
  const renamedTo = new Set(renamed.map((item) => item.to)); const renameMap = Object.fromEntries(renamed.map((item) => [item.from, item.to]));
  // Preserve structural facts for unchanged files. This makes hashing the
  // boundary for incremental work instead of reparsing the entire repository.
  const affectedFileIds = new Set([...changed].map(fileId));
  const removedNodeIds = new Set();
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.source === 'parser' && (affectedFileIds.has(id) || (node.evidence || []).some((p) => changed.has(p)))) { delete graph.nodes[id]; removedNodeIds.add(id); }
  }
  graph.edges = graph.edges.filter((edge) => !removedNodeIds.has(edge.from) && !removedNodeIds.has(edge.to) && !(edge.type === 'imports' && affectedFileIds.has(edge.from)) && edge.type !== 'calls');
  graph.files = {};
  for (const f of scanned) graph.files[f.path] = { hash: f.hash, size: f.size, language: f.language };
  const toParse = prior ? scanned.filter((f) => changed.has(f.path)) : scanned;
  for (const f of toParse) { const indexed = codeNodesFor(f); Object.assign(graph.nodes, indexed.nodes); graph.edges.push(...indexed.edges); }
  const config = resolverConfig(scanned);
  for (const f of toParse) { const parsed = parseFile(f); for (const spec of parsed.imports) { const target = resolveImport(f.path, spec, graph.files, f.language, config); if (target) graph.edges.push({ type: 'imports', from: fileId(f.path), to: fileId(target) }); } }
  const symbolsByName = new Map();
  for (const node of Object.values(graph.nodes)) if (node.type.startsWith('code.') && node.type !== 'code.file' && node.label) { const existing = symbolsByName.get(node.label) || []; existing.push(node.id); symbolsByName.set(node.label, existing); }
  for (const node of Object.values(graph.nodes)) if (node.type === 'code.file') for (const call of node.metadata?.calls || []) { const targets = symbolsByName.get(call) || []; if (targets.length === 1) graph.edges.push({ type: 'calls', from: node.id, to: targets[0] }); }
  const semantic = Object.values(graph.nodes).filter((node) => node.source !== 'parser'); let stale = 0;
  for (const node of semantic) {
    if (node.authority === 'canonical') continue;
    if (node.evidence?.some((p) => renameMap[p])) {
      node.evidence = node.evidence.map((p) => renameMap[p] || p); node.related = (node.related || []).map((id) => id.startsWith('code:file:') && renameMap[id.slice('code:file:'.length)] ? `code:file:${renameMap[id.slice('code:file:'.length)]}` : id);
      graph.edges = graph.edges.filter((edge) => edge.from !== node.id || edge.type !== 'supported_by'); for (const p of node.evidence) { const fid = fileId(p); if (graph.nodes[fid]) graph.edges.push({ type: 'supported_by', from: node.id, to: fid }); }
    }
    const affected = (node.evidence || []).filter((p) => changed.has(p) && !renamedTo.has(p));
    if (affected.length) { node.status = 'possibly_stale'; node.stale_reason = affected.map((p) => deleted.includes(p) ? `${p} deleted` : `${p} changed`).join('; '); stale++; }
  }
  graph.repository.indexed_at = new Date().toISOString(); graph.repository.indexed_revision = await git(root, ['rev-parse', 'HEAD']);
  graph.format_version = 3; graph.generator_version = '0.3.0';
  return { graph, summary: { added, modified, deleted, renamed, unchanged, stale, parsed: toParse.length } };
}
export async function freshness(root, graph) {
  const scanned = await scan(root); const next = Object.fromEntries(scanned.map((file) => [file.path, file])); const before = graph.files || {};
  const added = Object.keys(next).filter((p) => !before[p]);
  const modified = Object.keys(next).filter((p) => before[p] && before[p].hash !== next[p].hash);
  const deleted = Object.keys(before).filter((p) => !next[p]);
  return { added, modified, deleted, current: !added.length && !modified.length && !deleted.length };
}
export function semanticId(type, label) { return `${type}:${slug(label)}`; }
