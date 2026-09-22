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
    const action = change.action || 'upsert'; const type = change.type || 'knowledge.note'; const label = change.label || change.concept || change.title;
    const id = change.id || (label ? semanticId(type, label) : null); const existing = id && graph.nodes[id];
    if ((action === 'verify' || action === 'delete') && !existing) { warnings.push(`cannot ${action} missing node: ${id || 'no id'}`); continue; }
    if ((action === 'verify' || action === 'delete') && existing.authority === 'canonical' && source !== 'human') { warnings.push(`protected canonical node: ${id}`); continue; }
    if (action === 'delete') { delete graph.nodes[id]; graph.edges = graph.edges.filter((edge) => edge.from !== id && edge.to !== id); applied++; continue; }
    if (action === 'verify') { existing.status = 'verified'; existing.stale_reason = undefined; existing.updated_at = new Date().toISOString(); existing.last_verified_revision = graph.repository.indexed_revision || null; applied++; continue; }
    if (!label || !change.statement) { warnings.push('skipped change without label/concept and statement'); continue; }
    if (existing?.authority === 'canonical' && source !== 'human') { warnings.push(`protected canonical node: ${id}`); continue; }
    const evidence = [...new Set(change.evidence || existing?.evidence || [])]; const invalid = evidence.filter((p) => !graph.files[p] && !graph.nodes[p]);
    if (invalid.length) warnings.push(`${id}: evidence not indexed: ${invalid.join(', ')}`);
    const scope = change.scope || existing?.scope || null; const candidateNegates = /\b(not|never|prohibit|avoid|forbid)\b/i.test(change.statement);
    for (const node of Object.values(graph.nodes)) {
      if (node.id === id || node.authority !== 'canonical' || node.type !== type || (node.scope || null) !== scope) continue;
      const canonicalNegates = /\b(not|never|prohibit|avoid|forbid)\b/i.test(node.statement || ''); const overlap = (change.statement.toLowerCase().match(/[a-z]{4,}/g) || []).filter((term) => (node.statement || '').toLowerCase().includes(term));
      if (candidateNegates !== canonicalNegates && overlap.length) warnings.push(`potential contradiction with canonical node: ${node.id}`);
    }
    graph.nodes[id] = { id, type, label, statement: change.statement, source, authority: source === 'human' ? 'canonical' : (change.authority || 'inferred'), confidence: change.confidence ?? (source === 'human' ? 1 : 0.7), evidence, related: change.related || existing?.related || [], scope, status: invalid.length ? 'needs_verification' : 'verified', created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString(), last_verified_revision: graph.repository.indexed_revision || null };
    graph.edges = graph.edges.filter((edge) => edge.from !== id);
    for (const related of graph.nodes[id].related) if (graph.nodes[related]) graph.edges.push({ type: 'relates_to', from: id, to: related });
    for (const p of evidence) { const fid = `code:file:${p}`; if (graph.nodes[fid]) graph.edges.push({ type: 'supported_by', from: id, to: fid }); }
    applied++;
  }
  return { applied, warnings };
}
