import fs from 'node:fs/promises';
import { validateBrain } from './storage.js';

export async function readJson(input) {
  const raw = input === '-' ? await new Promise((resolve, reject) => { let text = ''; process.stdin.on('data', (chunk) => { text += chunk; }); process.stdin.on('end', () => resolve(text)); process.stdin.on('error', reject); }) : await fs.readFile(input, 'utf8');
  return JSON.parse(raw);
}
export function applyOperations(brain, input) {
  if (!Array.isArray(input?.operations)) throw new Error('patch requires an operations array');
  let applied = 0;
  for (const operation of input.operations) {
    const collection = operation.collection;
    if (!['areas', 'workflows', 'decisions', 'conventions'].includes(collection)) throw new Error(`unsupported collection: ${collection}`);
    const items = brain.chart[collection];
    if (operation.op === 'upsert') {
      if (!operation.item?.id) throw new Error(`upsert ${collection} requires item.id`);
      const index = items.findIndex((item) => item.id === operation.item.id); if (index >= 0) items[index] = operation.item; else items.push(operation.item); applied++;
    } else if (operation.op === 'delete') {
      const index = items.findIndex((item) => item.id === operation.id); if (index >= 0) { items.splice(index, 1); applied++; }
    } else throw new Error(`unsupported operation: ${operation.op}`);
  }
  if (typeof input.summary === 'string') brain.chart.summary = input.summary;
  validateBrain(brain); return applied;
}
