import fs from 'node:fs/promises';
import path from 'node:path';
import { FORMAT_VERSION, GENERATOR_VERSION, GRAPH_PATH } from './constants.js';

export function emptyGraph(root) {
  return { format_version: FORMAT_VERSION, generator_version: GENERATOR_VERSION, repository: { root: '.', indexed_revision: null, indexed_at: new Date().toISOString() }, files: {}, nodes: {}, edges: [] };
}
export async function loadGraph(root) {
  const file = path.join(root, GRAPH_PATH);
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error(`cannot read ${GRAPH_PATH}: ${error.message}`); }
}
export async function saveGraph(root, graph) {
  const file = path.join(root, GRAPH_PATH);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(graph, null, 2)}\n`);
}
