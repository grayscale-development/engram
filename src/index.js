import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCortexWithRevision } from './storage.js';

const collections = ['areas', 'workflows', 'decisions', 'conventions'];
const words = (value) => value.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];

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
    const fields = { id: entry.id, label: entry.label, summary: entry.summary, evidence: entry.evidence?.join(' ') ?? '' };
    const searchable = Object.values(fields).join(' ').toLowerCase();
    if (!terms.every((term) => searchable.includes(term))) continue;
    const score = terms.reduce((total, term) => total + (fields.label.toLowerCase().includes(term) ? 5 : 0) + (fields.id.toLowerCase().includes(term) ? 3 : 0) + (fields.summary.toLowerCase().includes(term) ? 2 : 0) + (fields.evidence.toLowerCase().includes(term) ? 1 : 0), 0);
    matches.push({ score, root: repository.root, repository: repository.repository.name, collection: entry.collection, id: entry.id, label: entry.label, summary: entry.summary, evidence: entry.evidence ?? [] });
  }
  return { query, matches: matches.sort((left, right) => right.score - left.score || left.root.localeCompare(right.root)).slice(0, 50) };
}
