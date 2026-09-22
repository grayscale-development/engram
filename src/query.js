import { terms, tokenEstimate } from './utils.js';

function searchable(node) { return [node.label, node.statement, node.type, ...(node.evidence || []), ...(node.metadata?.keywords || []), ...(node.metadata?.symbols || []).map((x) => x.name)].filter(Boolean).join(' '); }
export function rank(graph, query) {
  const q = terms(query); const nodes = Object.values(graph.nodes);
  const scored = nodes.map((node) => { const hay = terms(searchable(node)); const overlap = q.filter((t) => hay.some((h) => h === t || h.includes(t) || t.includes(h))).length; const authority = node.authority === 'canonical' ? 2 : node.source === 'agent' ? 1 : 0; const freshness = node.status === 'possibly_stale' ? -1 : 0; return { node, score: overlap * 8 + authority + freshness }; }).filter((x) => x.score > 0).sort((a,b) => b.score - a.score || a.node.label.localeCompare(b.node.label));
  return scored;
}
export function relatedFiles(graph, selected) {
  const ids = new Set(selected.map((x) => x.node.id)); const files = new Set();
  for (const item of selected) for (const p of item.node.evidence || []) if (graph.files[p]) files.add(p);
  for (const edge of graph.edges) if (ids.has(edge.from) || ids.has(edge.to)) { const other = ids.has(edge.from) ? edge.to : edge.from; const node = graph.nodes[other]; if (node?.type === 'code.file') files.add(node.label); }
  return [...files];
}
export function contextPacket(graph, query, budget = 2000) {
  const chosen = rank(graph, query); const lines = [`TASK\n${query}`]; const groups = [['CANONICAL CONSTRAINTS', (n) => n.authority === 'canonical'], ['PRODUCT / WORKFLOWS', (n) => /product|workflow|concept/.test(n.type)], ['ARCHITECTURE / CODE', (n) => n.type.startsWith('code.')], ['DECISIONS / NOTES', (n) => !n.type.startsWith('code.')]];
  const included = []; let used = tokenEstimate(lines.join('\n'));
  for (const [heading, predicate] of groups) { const entries = []; for (const item of chosen) { if (!predicate(item.node) || included.includes(item)) continue; const n = item.node; const detail = n.statement ? `${n.label}: ${n.statement}${n.status === 'possibly_stale' ? ' [possibly stale]' : ''}` : `${n.label}${n.metadata?.language ? ` (${n.metadata.language})` : ''}`; const cost = tokenEstimate(detail); if (used + cost > budget) continue; entries.push(`- ${detail}`); included.push(item); used += cost; if (entries.length >= 5) break; } if (entries.length) lines.push(`\n${heading}\n${entries.join('\n')}`); }
  const files = relatedFiles(graph, included).slice(0, 12); if (files.length) lines.push(`\nRECOMMENDED SOURCE\n${files.map((f) => `- ${f}`).join('\n')}`);
  lines.push(`\nPACKET\n~${tokenEstimate(lines.join('\n'))} tokens; ${files.length} source files`);
  return { text: lines.join('\n'), nodes: included.map((x) => x.node.id), files, tokens: tokenEstimate(lines.join('\n')) };
}
