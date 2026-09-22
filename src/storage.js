import fs from 'node:fs/promises';
import path from 'node:path';
import { BRAIN_PATH, FORMAT_VERSION } from './constants.js';

export function emptyBrain(root) {
  return { format_version: FORMAT_VERSION, repository: { name: path.basename(root), root: '.' }, chart: { summary: '', areas: [], workflows: [], decisions: [], conventions: [] }, updated_at: new Date().toISOString() };
}
export function validateBrain(brain) {
  if (!brain || typeof brain !== 'object' || Array.isArray(brain)) throw new Error('brain must be a JSON object');
  if (!brain.repository || typeof brain.repository !== 'object') throw new Error('brain.repository must be an object');
  if (!brain.chart || typeof brain.chart !== 'object') throw new Error('brain.chart must be an object');
  for (const collection of ['areas', 'workflows', 'decisions', 'conventions']) if (!Array.isArray(brain.chart[collection])) throw new Error(`brain.chart.${collection} must be an array`);
  return brain;
}
export async function loadBrain(root) {
  const file = path.join(root, BRAIN_PATH);
  try { return validateBrain(JSON.parse(await fs.readFile(file, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function saveBrain(root, brain) {
  validateBrain(brain); brain.format_version = FORMAT_VERSION; brain.updated_at = new Date().toISOString();
  const file = path.join(root, BRAIN_PATH); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(brain, null, 2)}\n`);
}
