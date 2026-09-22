import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { build } from './indexer.js';
import { saveGraph } from './storage.js';

const now = () => performance.now();
async function writeFixture(root, files) {
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'graph-ai-benchmark', type: 'module' }));
  for (let index = 0; index < files; index++) {
    const name = `file${String(index).padStart(4, '0')}`; const previous = index ? `import { value as previous } from './file${String(index - 1).padStart(4, '0')}.ts';\n` : ''; const body = `${previous}export const value = ${index}${index ? ' + previous' : ''};\nexport function compute${index}() { return value; }\n`;
    await fs.writeFile(path.join(root, 'src', `${name}.ts`), body);
  }
}
export async function runBenchmark(fileCount = 500) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-ai-benchmark-'));
  try {
    await writeFixture(root, fileCount); let start = now(); let { graph, summary } = await build(root); const initialMs = now() - start; await saveGraph(root, graph); const graphBytes = (await fs.stat(path.join(root, '.ai', 'graph'))).size;
    const runUpdate = async (ratio) => {
      const changed = ratio === 0 ? 0 : Math.max(1, Math.ceil(fileCount * ratio));
      for (let index = 0; index < changed; index++) await fs.appendFile(path.join(root, 'src', `file${String(index).padStart(4, '0')}.ts`), `// benchmark revision ${ratio}\n`);
      start = now(); const result = await build(root, graph); const milliseconds = now() - start; graph = result.graph; await saveGraph(root, graph); return { ratio, changed, parsed: result.summary.parsed, milliseconds: Number(milliseconds.toFixed(2)) };
    };
    const updates = [await runUpdate(0), await runUpdate(0.01), await runUpdate(0.05), await runUpdate(1)];
    return { files: fileCount, initial: { parsed: summary.parsed, milliseconds: Number(initialMs.toFixed(2)) }, updates, graph_bytes: graphBytes, rss_bytes: process.memoryUsage().rss };
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
export function benchmarkText(result) {
  return `GRAPH-AI BENCHMARK\nFiles: ${result.files}\nInitial build: ${result.initial.milliseconds}ms (${result.initial.parsed} parsed)\nGraph size after initial build: ${result.graph_bytes} bytes\nRSS: ${result.rss_bytes} bytes\n\nUPDATES\n${result.updates.map((update) => `${(update.ratio * 100).toFixed(0)}% changed: ${update.milliseconds}ms; ${update.parsed} parsed`).join('\n')}`;
}
