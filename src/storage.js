import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { FORMAT_VERSION, GENERATOR_VERSION, GRAPH_PATH } from './constants.js';

export function emptyGraph(root) {
  return { format_version: FORMAT_VERSION, generator_version: GENERATOR_VERSION, repository: { root: '.', indexed_revision: null, indexed_at: new Date().toISOString() }, files: {}, nodes: {}, edges: [] };
}
export async function loadGraph(root) {
  const file = path.join(root, GRAPH_PATH);
  try {
    const raw = await fs.readFile(file);
    // v0.1/v0.2 stored plain JSON. v0.3 writes gzip JSON while preserving
    // portable, dependency-free migration for graphs already committed.
    const text = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
    return JSON.parse(text);
  }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error(`cannot read ${GRAPH_PATH}: ${error.message}`); }
}
export async function saveGraph(root, graph) {
  const file = path.join(root, GRAPH_PATH);
  await fs.mkdir(path.dirname(file), { recursive: true });
  // The public artifact is compressed JSON. It is local, portable, and fully
  // inspectable through the CLI; gzip's deterministic output avoids churn.
  await fs.writeFile(file, gzipSync(JSON.stringify(graph), { level: 9 }));
}
