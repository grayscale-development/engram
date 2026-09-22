import fs from 'node:fs/promises';
import path from 'node:path';
import { BRAIN_PATH, FORMAT_VERSION } from './constants.js';

export function emptyBrain(root) {
  return { format_version: FORMAT_VERSION, repository: { name: path.basename(root), root: '.' }, chart: { summary: '', areas: [], workflows: [], decisions: [], conventions: [] }, updated_at: new Date().toISOString() };
}
export function validateBrain(brain) {
  if (!brain || typeof brain !== 'object' || Array.isArray(brain)) throw new Error('brain must be a JSON object');
  if (brain.format_version !== undefined && brain.format_version !== FORMAT_VERSION) throw new Error(`unsupported brain format: ${brain.format_version}`);
  if (!brain.repository || typeof brain.repository !== 'object') throw new Error('brain.repository must be an object');
  if (!brain.chart || typeof brain.chart !== 'object') throw new Error('brain.chart must be an object');
  if (typeof brain.repository.name !== 'string' || !brain.repository.name.trim()) throw new Error('brain.repository.name must be a non-empty string');
  if (typeof brain.chart.summary !== 'string') throw new Error('brain.chart.summary must be a string');
  for (const collection of ['areas', 'workflows', 'decisions', 'conventions']) {
    if (!Array.isArray(brain.chart[collection])) throw new Error(`brain.chart.${collection} must be an array`);
    const ids = new Set();
    for (const item of brain.chart[collection]) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`brain.chart.${collection} entries must be objects`);
      if (typeof item.id !== 'string' || !item.id.trim()) throw new Error(`brain.chart.${collection} entries need a non-empty id`);
      if (ids.has(item.id)) throw new Error(`brain.chart.${collection} has duplicate id: ${item.id}`); ids.add(item.id);
      if (typeof item.label !== 'string' || !item.label.trim()) throw new Error(`brain.chart.${collection}.${item.id} needs a non-empty label`);
      if (typeof item.summary !== 'string' || !item.summary.trim()) throw new Error(`brain.chart.${collection}.${item.id} needs a non-empty summary`);
      if (item.evidence !== undefined && (!Array.isArray(item.evidence) || item.evidence.some((value) => typeof value !== 'string'))) throw new Error(`brain.chart.${collection}.${item.id}.evidence must be an array of strings`);
    }
  }
  return brain;
}
export async function loadBrain(root) {
  const file = path.join(root, BRAIN_PATH);
  try { return validateBrain(JSON.parse(await fs.readFile(file, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function saveBrain(root, brain) {
  validateBrain(brain); brain.format_version = FORMAT_VERSION; brain.updated_at = new Date().toISOString();
  const file = path.join(root, BRAIN_PATH); const temporary = `${file}.${process.pid}.tmp`; await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(temporary, `${JSON.stringify(brain, null, 2)}\n`); await fs.rename(temporary, file);
}
