import fs from 'node:fs/promises';
import path from 'node:path';
import { CORTEX_PATH, FORMAT_VERSION } from './constants.js';

export function emptyCortex(root) {
  return { format_version: FORMAT_VERSION, repository: { name: path.basename(root), root: '.' }, chart: { summary: '', areas: [], workflows: [], decisions: [], conventions: [] }, updated_at: new Date().toISOString() };
}
export function validateCortex(cortex) {
  if (!cortex || typeof cortex !== 'object' || Array.isArray(cortex)) throw new Error('cortex must be a JSON object');
  if (cortex.format_version !== undefined && cortex.format_version !== FORMAT_VERSION) throw new Error(`unsupported cortex format: ${cortex.format_version}`);
  if (!cortex.repository || typeof cortex.repository !== 'object') throw new Error('cortex.repository must be an object');
  if (!cortex.chart || typeof cortex.chart !== 'object') throw new Error('cortex.chart must be an object');
  if (typeof cortex.repository.name !== 'string' || !cortex.repository.name.trim()) throw new Error('cortex.repository.name must be a non-empty string');
  if (typeof cortex.chart.summary !== 'string') throw new Error('cortex.chart.summary must be a string');
  for (const collection of ['areas', 'workflows', 'decisions', 'conventions']) {
    if (!Array.isArray(cortex.chart[collection])) throw new Error(`cortex.chart.${collection} must be an array`);
    const ids = new Set();
    for (const item of cortex.chart[collection]) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`cortex.chart.${collection} entries must be objects`);
      if (typeof item.id !== 'string' || !item.id.trim()) throw new Error(`cortex.chart.${collection} entries need a non-empty id`);
      if (ids.has(item.id)) throw new Error(`cortex.chart.${collection} has duplicate id: ${item.id}`); ids.add(item.id);
      if (typeof item.label !== 'string' || !item.label.trim()) throw new Error(`cortex.chart.${collection}.${item.id} needs a non-empty label`);
      if (typeof item.summary !== 'string' || !item.summary.trim()) throw new Error(`cortex.chart.${collection}.${item.id} needs a non-empty summary`);
      if (item.evidence !== undefined && (!Array.isArray(item.evidence) || item.evidence.some((value) => typeof value !== 'string'))) throw new Error(`cortex.chart.${collection}.${item.id}.evidence must be an array of strings`);
    }
  }
  return cortex;
}
export async function loadCortex(root) {
  const file = path.join(root, CORTEX_PATH);
  try { return validateCortex(JSON.parse(await fs.readFile(file, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function saveCortex(root, cortex) {
  validateCortex(cortex); cortex.format_version = FORMAT_VERSION; cortex.updated_at = new Date().toISOString();
  const file = path.join(root, CORTEX_PATH); const temporary = `${file}.${process.pid}.tmp`; await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(temporary, `${JSON.stringify(cortex, null, 2)}\n`); await fs.rename(temporary, file);
}
