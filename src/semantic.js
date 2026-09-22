import fs from 'node:fs/promises';
import { semanticId } from './indexer.js';

export async function readDelta(input) {
  if (!input) return null;
  const raw = input === '-' ? await new Promise((resolve, reject) => { let s = ''; process.stdin.on('data', (d) => s += d); process.stdin.on('end', () => resolve(s)); process.stdin.on('error', reject); }) : await fs.readFile(input, 'utf8');
  const delta = JSON.parse(raw); if (!Array.isArray(delta.changes)) throw new Error('semantic delta requires a changes array'); return delta;
}
export function applyDelta(graph, delta, source = 'agent') {
  if (!delta) return { applied: 0, warnings: [] }; const warnings = []; let applied = 0;
  for (const change of delta.changes) {
    const type = change.type || 'knowledge.note'; const label = change.label || change.concept || change.title;
    if (!label || !change.statement) { warnings.push('skipped change without label/concept and statement'); continue; }
    const id = change.id || semanticId(type, label); const existing = graph.nodes[id];
    if (existing?.authority === 'canonical' && source !== 'human') { warnings.push(`protected canonical node: ${id}`); continue; }
    const evidence = [...new Set(change.evidence || existing?.evidence || [])]; const invalid = evidence.filter((p) => !graph.files[p] && !graph.nodes[p]);
    if (invalid.length) warnings.push(`${id}: evidence not indexed: ${invalid.join(', ')}`);
    graph.nodes[id] = { id, type, label, statement: change.statement, source, authority: source === 'human' ? 'canonical' : (change.authority || 'inferred'), confidence: change.confidence ?? (source === 'human' ? 1 : 0.7), evidence, related: change.related || existing?.related || [], status: invalid.length ? 'needs_verification' : 'verified', created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString(), last_verified_revision: graph.repository.indexed_revision || null };
    graph.edges = graph.edges.filter((edge) => edge.from !== id);
    for (const related of graph.nodes[id].related) if (graph.nodes[related]) graph.edges.push({ type: 'relates_to', from: id, to: related });
    for (const p of evidence) { const fid = `code:file:${p}`; if (graph.nodes[fid]) graph.edges.push({ type: 'supported_by', from: id, to: fid }); }
    applied++;
  }
  return { applied, warnings };
}
