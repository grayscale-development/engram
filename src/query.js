import { terms, tokenEstimate } from './utils.js';

const QUERY_STOPWORDS = new Set(['about', 'are', 'change', 'fix', 'for', 'from', 'how', 'make', 'modify', 'please', 'show', 'that', 'the', 'this', 'what', 'when', 'where', 'with']);
function queryTerms(query) { return terms(query).filter((term) => !QUERY_STOPWORDS.has(term)); }

function searchable(node) { return [node.label, node.statement, node.scope, node.type, ...(node.evidence || []), ...(node.metadata?.keywords || []), ...(node.metadata?.symbols || []).map((x) => x.name)].filter(Boolean).join(' '); }
export function rank(graph, query) {
  const q = queryTerms(query); const nodes = Object.values(graph.nodes);
  const scored = nodes.map((node) => { const hay = terms(searchable(node)); const direct = terms(`${node.label || ''} ${node.statement || ''}`); const overlap = q.filter((t) => hay.some((h) => h === t || h.includes(t) || t.includes(h))).length; const directOverlap = q.filter((t) => direct.includes(t)).length; const authority = node.authority === 'canonical' ? 2 : node.source === 'agent' ? 1 : 0; const freshness = node.status === 'possibly_stale' ? -1 : 0; return { node, match: overlap, score: overlap * 8 + directOverlap * 6 + authority + freshness }; }).filter((x) => x.match > 0).sort((a,b) => b.score - a.score || a.node.label.localeCompare(b.node.label));
  return scored;
}
function fileRole(graph, file) {
  const node = graph.nodes[`code:file:${file}`]; if (node?.metadata?.test) return 'test';
  if (node?.metadata?.kind || /(^|\/)(docs?|adr)\/|\.md$/i.test(file)) return 'document';
  if (/(^|\/)(services?|controllers?|permissions?|routes?)(\/|$)/i.test(file)) return 'backend';
  if (/(^|\/)(frontend|web|components?|hooks?)(\/|$)/i.test(file)) return 'frontend';
  if (/(^|\/)(api|clients?)(\/|$)/i.test(file)) return 'api';
  if (/(^|\/)(models?|stores?|repositories?)(\/|$)/i.test(file)) return 'model';
  return 'implementation';
}
function roleWeight(role) { return ({ document: 0.25, test: 0.6, implementation: 1, frontend: 1, backend: 1, api: 0.9, model: 0.8 })[role] || 1; }
function pathBoost(file, termsForQuery) {
  const path = file.toLowerCase(); let boost = 1;
  if (termsForQuery.some((term) => /authori[sz]|permission|access|security/.test(term)) && /(service|controller|permission|auth|route)/.test(path)) boost *= 1.6;
  if (termsForQuery.some((term) => /ui|frontend|component|modal|screen/.test(term)) && /(frontend|web|component|hook|modal)/.test(path)) boost *= 1.45;
  if (termsForQuery.some((term) => /api|endpoint|route/.test(term)) && /(api|client|controller|route)/.test(path)) boost *= 1.35;
  if (termsForQuery.some((term) => /test|spec/.test(term)) && /(test|spec)/.test(path)) boost *= 1.5;
  return boost;
}
export function relatedFiles(graph, selected, query) {
  const ids = new Set(selected.map((x) => x.node.id)); const scores = new Map(); const add = (file, score) => { if (graph.files[file]) scores.set(file, (scores.get(file) || 0) + score); };
  for (const item of selected) {
    for (const p of item.node.evidence || []) add(p, item.score * 2);
    if (item.node.type === 'code.file') add(item.node.label, item.score * 3);
  }
  for (const edge of graph.edges) if (ids.has(edge.from) || ids.has(edge.to)) { const selectedItem = selected.find((item) => item.node.id === edge.from || item.node.id === edge.to); const other = ids.has(edge.from) ? edge.to : edge.from; const node = graph.nodes[other]; if (node?.type === 'code.file') add(node.label, selectedItem.score); }
  const queryWords = queryTerms(query); const candidates = [...scores.entries()].map(([file, score]) => ({ file, role: fileRole(graph, file), score: score * roleWeight(fileRole(graph, file)) * pathBoost(file, queryWords) })).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  const start = []; const adjacent = []; const selectedRoles = new Map();
  for (const candidate of candidates) {
    if (candidate.role === 'document' || candidate.role === 'test') { adjacent.push(candidate); continue; }
    const repeats = selectedRoles.get(candidate.role) || 0; const diversityScore = candidate.score / (1 + repeats * 0.45);
    if (start.length < 3 && diversityScore >= candidate.score * 0.55) { start.push(candidate); selectedRoles.set(candidate.role, repeats + 1); } else adjacent.push(candidate);
  }
  return { start, adjacent: [...adjacent, ...candidates.filter((candidate) => !start.includes(candidate) && !adjacent.includes(candidate))].slice(0, 4) };
}
function isOrientationQuery(query) {
  const orientationTerms = new Set(['tell', 'me', 'repo', 'repository', 'project', 'codebase', 'overview', 'orient', 'orientation', 'explain']);
  const q = queryTerms(query);
  return q.length > 0 && q.every((term) => orientationTerms.has(term));
}
function orientationPacket(graph, query) {
  const paths = Object.keys(graph.files).sort(); const choose = (pattern) => paths.find((file) => pattern.test(file));
  const files = [choose(/(^|\/)readme\.md$/i), choose(/(^|\/)package\.json$/i), choose(/(^|\/)(app\/router|src\/index|main|index)\.[cm]?[jt]sx?$/i), choose(/(^|\/)config\//i)].filter(Boolean);
  for (const file of paths) if (files.length < 3 && !files.includes(file)) files.push(file);
  const selected = files.slice(0, 3); const languages = [...new Set(Object.values(graph.files).map((file) => file.language))];
  const lines = [`TASK\n${query}`, `\nREPOSITORY OVERVIEW\n- ${paths.length} indexed files\n- Stack: ${languages.join(', ') || 'No indexed source'}`, `\nSTART HERE\n${selected.map((file) => `- ${file}`).join('\n')}`];
  lines.push(`\nPACKET\n~${tokenEstimate(lines.join('\n'))} tokens; ${selected.length} start files; 0 adjacent files`);
  return { text: lines.join('\n'), nodes: selected.map((file) => `code:file:${file}`).filter((id) => graph.nodes[id]), files: selected, adjacent_files: [], tokens: tokenEstimate(lines.join('\n')) };
}
export function contextPacket(graph, query, budget = 2000) {
  if (isOrientationQuery(query)) return orientationPacket(graph, query);
  const chosen = rank(graph, query); const lines = [`TASK\n${query}`]; const groups = [['CANONICAL CONSTRAINTS', (n) => n.authority === 'canonical'], ['PRODUCT / WORKFLOWS', (n) => /product|workflow|concept/.test(n.type)], ['ARCHITECTURE / CODE', (n) => n.type.startsWith('code.')], ['DECISIONS / NOTES', (n) => !n.type.startsWith('code.')]];
  const included = []; let used = tokenEstimate(lines.join('\n'));
  const globalThreshold = chosen[0] ? chosen[0].score * 0.55 : Infinity;
  for (const [heading, predicate] of groups) {
    const entries = []; const candidates = chosen.filter((item) => predicate(item.node) && !included.includes(item)); const threshold = globalThreshold;
    for (const item of candidates) { if (item.score < threshold) continue; const n = item.node; const detail = n.statement ? `${n.label}${n.scope ? ` [scope: ${n.scope}]` : ''}: ${n.statement}${n.status === 'possibly_stale' ? ' [possibly stale]' : ''}` : `${n.label}${n.metadata?.language ? ` (${n.metadata.language})` : ''}`; const cost = tokenEstimate(detail); if (used + cost > budget) continue; entries.push(`- ${detail}`); included.push(item); used += cost; if (entries.length >= (heading === 'ARCHITECTURE / CODE' ? 2 : 3)) break; }
    if (entries.length) lines.push(`\n${heading}\n${entries.join('\n')}`);
  }
  const recommendation = relatedFiles(graph, included, query); const files = recommendation.start.map((item) => item.file); const adjacentFiles = recommendation.adjacent.map((item) => item.file);
  if (files.length) lines.push(`\nSTART HERE\n${files.map((f) => `- ${f}`).join('\n')}`);
  if (adjacentFiles.length) lines.push(`\nALSO RELEVANT\n${adjacentFiles.map((f) => `- ${f}`).join('\n')}`);
  lines.push(`\nPACKET\n~${tokenEstimate(lines.join('\n'))} tokens; ${files.length} start files; ${adjacentFiles.length} adjacent files`);
  return { text: lines.join('\n'), nodes: included.map((x) => x.node.id), files, adjacent_files: adjacentFiles, tokens: tokenEstimate(lines.join('\n')) };
}
