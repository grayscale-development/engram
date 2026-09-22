import { terms, tokenEstimate } from './utils.js';

const QUERY_STOPWORDS = new Set(['about', 'are', 'change', 'fix', 'for', 'from', 'how', 'make', 'modify', 'please', 'show', 'that', 'the', 'this', 'what', 'when', 'where', 'with']);
function queryTerms(query) { return terms(query).filter((term) => !QUERY_STOPWORDS.has(term)); }

function searchable(node) { return [node.label, node.statement, node.scope, node.type, ...(node.evidence || []), ...(node.metadata?.keywords || []), ...(node.metadata?.symbols || []).map((x) => x.name)].filter(Boolean).join(' '); }
export function rank(graph, query) {
  const q = queryTerms(query); const nodes = Object.values(graph.nodes);
  const scored = nodes.map((node) => { const hay = terms(searchable(node)); const direct = terms(`${node.label || ''} ${node.statement || ''}`); const overlap = q.filter((t) => hay.some((h) => h === t || h.includes(t) || t.includes(h))).length; const directOverlap = q.filter((t) => direct.includes(t)).length; const authority = node.authority === 'canonical' ? 2 : node.source === 'agent' ? 1 : 0; const freshness = node.status === 'possibly_stale' ? -1 : 0; return { node, match: overlap, score: overlap * 8 + directOverlap * 6 + authority + freshness }; }).filter((x) => x.match > 0).sort((a,b) => b.score - a.score || a.node.label.localeCompare(b.node.label));
  return scored;
}
export function relatedFiles(graph, selected) {
  const ids = new Set(selected.map((x) => x.node.id)); const scores = new Map(); const add = (file, score) => { if (graph.files[file]) scores.set(file, (scores.get(file) || 0) + score); };
  for (const item of selected) {
    for (const p of item.node.evidence || []) add(p, item.score * 2);
    if (item.node.type === 'code.file') add(item.node.label, item.score * 3);
  }
  for (const edge of graph.edges) if (ids.has(edge.from) || ids.has(edge.to)) { const selectedItem = selected.find((item) => item.node.id === edge.from || item.node.id === edge.to); const other = ids.has(edge.from) ? edge.to : edge.from; const node = graph.nodes[other]; if (node?.type === 'code.file') add(node.label, selectedItem.score); }
  return [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([file]) => file);
}
export function contextPacket(graph, query, budget = 2000) {
  const chosen = rank(graph, query); const lines = [`TASK\n${query}`]; const groups = [['CANONICAL CONSTRAINTS', (n) => n.authority === 'canonical'], ['PRODUCT / WORKFLOWS', (n) => /product|workflow|concept/.test(n.type)], ['ARCHITECTURE / CODE', (n) => n.type.startsWith('code.')], ['DECISIONS / NOTES', (n) => !n.type.startsWith('code.')]];
  const included = []; let used = tokenEstimate(lines.join('\n'));
  const globalThreshold = chosen[0] ? chosen[0].score * 0.55 : Infinity;
  for (const [heading, predicate] of groups) {
    const entries = []; const candidates = chosen.filter((item) => predicate(item.node) && !included.includes(item)); const threshold = globalThreshold;
    for (const item of candidates) { if (item.score < threshold) continue; const n = item.node; const detail = n.statement ? `${n.label}${n.scope ? ` [scope: ${n.scope}]` : ''}: ${n.statement}${n.status === 'possibly_stale' ? ' [possibly stale]' : ''}` : `${n.label}${n.metadata?.language ? ` (${n.metadata.language})` : ''}`; const cost = tokenEstimate(detail); if (used + cost > budget) continue; entries.push(`- ${detail}`); included.push(item); used += cost; if (entries.length >= (heading === 'ARCHITECTURE / CODE' ? 2 : 3)) break; }
    if (entries.length) lines.push(`\n${heading}\n${entries.join('\n')}`);
  }
  const files = relatedFiles(graph, included).slice(0, 5); if (files.length) lines.push(`\nRECOMMENDED SOURCE\n${files.map((f) => `- ${f}`).join('\n')}`);
  lines.push(`\nPACKET\n~${tokenEstimate(lines.join('\n'))} tokens; ${files.length} source files`);
  return { text: lines.join('\n'), nodes: included.map((x) => x.node.id), files, tokens: tokenEstimate(lines.join('\n')) };
}
