import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCortexWithRevision } from './storage.js';

const collections = ['areas', 'workflows', 'decisions', 'conventions'];
const words = (value) => value.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
const focusProtocol = (evidenceLimit) => ({
  initial_evidence_limit: evidenceLimit,
  instructions: [
    'Open only evidence_paths first; expand only when an answer requirement remains unproven.',
    'Treat Cortex summaries and keywords as navigation, never as proof; verify every factual claim in source.',
    'Read only repository instructions directly relevant to this task; do not recursively open unrelated imports, credential guidance, or service-operation material.',
    'Before answering, complete the correctness_gate internally. After a verified recurring discovery, update one durable Cortex entry with keywords.'
  ],
  correctness_gate: [
    'Every requested conclusion has direct source evidence.',
    'For authorization or persistence work: trace the authorized entity, loaded entity, mutated entity, and post-action behavior.',
    'Separate observed behavior from assumptions; resolve contradictions before finalizing.'
  ]
});
function prioritizedEvidence(entries, limit) {
  const selected = [];
  const add = (path) => { if (path && !selected.includes(path) && selected.length < limit) selected.push(path); };
  for (const entry of entries) add(entry.evidence?.[0]);
  for (const entry of entries) for (const path of entry.evidence?.slice(1) ?? []) add(path);
  return selected;
}

function matchingEntries(cortex, query) {
  const terms = [...new Set(words(query))];
  if (terms.length === 0) throw new Error('query must contain a searchable word');
  return collections.flatMap((collection) => cortex.chart[collection].map((entry) => {
    const fields = { id: entry.id, label: entry.label, summary: entry.summary, keywords: entry.keywords?.join(' ') ?? '', evidence: entry.evidence?.join(' ') ?? '' };
    const lowered = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.toLowerCase()]));
    const matchedTerms = terms.filter((term) => Object.values(lowered).some((value) => value.includes(term)));
    const score = matchedTerms.reduce((total, term) => total + (lowered.keywords.includes(term) ? 8 : 0) + (lowered.label.includes(term) ? 5 : 0) + (lowered.id.includes(term) ? 3 : 0) + (lowered.summary.includes(term) ? 2 : 0) + (lowered.evidence.includes(term) ? 1 : 0), 0);
    return { score, matchedTerms, collection, ...entry };
  })).filter((entry) => entry.score > 0).sort((left, right) => right.score - left.score || left.collection.localeCompare(right.collection) || left.id.localeCompare(right.id));
}

export function focusCortex(snapshot, query, limit = 5, evidenceLimit = 5) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('limit must be an integer from 1 through 50');
  if (!Number.isInteger(evidenceLimit) || evidenceLimit < 1 || evidenceLimit > 20) throw new Error('evidence_limit must be an integer from 1 through 20');
  const selected = matchingEntries(snapshot.cortex, query).slice(0, limit);
  const evidencePaths = prioritizedEvidence(selected, evidenceLimit);
  return {
    repository: snapshot.cortex.repository,
    revision: snapshot.revision,
    summary: snapshot.cortex.chart.summary,
    query,
    evidence_paths: evidencePaths,
    protocol: focusProtocol(evidenceLimit),
    matches: selected.map((entry) => ({ ...entry, evidence: (entry.evidence ?? []).filter((path) => evidencePaths.includes(path)) }))
  };
}

export async function buildCortexIndex(roots) {
  if (!Array.isArray(roots) || roots.length === 0) throw new Error('index input requires a non-empty roots array');
  const repositories = [];
  for (const configuredRoot of [...new Set(roots)]) {
    const root = path.resolve(configuredRoot); const snapshot = await loadCortexWithRevision(root);
    if (!snapshot) throw new Error(`no .engram/cortex.json in ${root}`);
    const entries = collections.flatMap((collection) => snapshot.cortex.chart[collection].map((entry) => ({ collection, ...entry })));
    repositories.push({ root, revision: snapshot.revision, repository: snapshot.cortex.repository, summary: snapshot.cortex.chart.summary, entries });
  }
  return { format_version: 1, kind: 'engram-derived-cortex-index', generated_at: new Date().toISOString(), repositories };
}
export async function writeCortexIndex(file, index) {
  const target = path.resolve(file); const temporary = `${target}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(temporary, `${JSON.stringify(index)}\n`); await fs.rename(temporary, target);
}
export async function readCortexIndex(file) {
  const index = JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
  if (index?.kind !== 'engram-derived-cortex-index' || !Array.isArray(index.repositories)) throw new Error('invalid derived Cortex index');
  return index;
}
export function searchCortexIndex(index, query) {
  const terms = words(query); if (terms.length === 0) throw new Error('query must contain a searchable word');
  const matches = [];
  for (const repository of index.repositories) for (const entry of repository.entries) {
    const fields = { id: entry.id, label: entry.label, summary: entry.summary, keywords: entry.keywords?.join(' ') ?? '', evidence: entry.evidence?.join(' ') ?? '' };
    const searchable = Object.values(fields).join(' ').toLowerCase();
    if (!terms.every((term) => searchable.includes(term))) continue;
    const score = terms.reduce((total, term) => total + (fields.keywords.toLowerCase().includes(term) ? 8 : 0) + (fields.label.toLowerCase().includes(term) ? 5 : 0) + (fields.id.toLowerCase().includes(term) ? 3 : 0) + (fields.summary.toLowerCase().includes(term) ? 2 : 0) + (fields.evidence.toLowerCase().includes(term) ? 1 : 0), 0);
    matches.push({ score, root: repository.root, repository: repository.repository.name, collection: entry.collection, id: entry.id, label: entry.label, summary: entry.summary, evidence: entry.evidence ?? [] });
  }
  return { query, matches: matches.sort((left, right) => right.score - left.score || left.root.localeCompare(right.root)).slice(0, 50) };
}
