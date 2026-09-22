import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from './indexer.js';
import { applyDelta } from './semantic.js';
import { contextPacket } from './query.js';

async function applyMutation(root, mutation) {
  const file = path.join(root, mutation.path);
  if (mutation.op === 'delete') return fs.unlink(file);
  if (mutation.op === 'append') return fs.appendFile(file, mutation.content || '\n');
  if (mutation.op === 'rename') return fs.rename(file, path.join(root, mutation.to));
  throw new Error(`unsupported fixture mutation: ${mutation.op}`);
}
async function evaluateMutation(fixtureRoot, delta, mutation) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-ai-mutation-'));
  try {
    await fs.cp(fixtureRoot, root, { recursive: true }); const { graph } = await build(root); applyDelta(graph, delta); await applyMutation(root, mutation); const { graph: updated } = await build(root, graph);
    const node = Object.values(updated.nodes).find((candidate) => candidate.label === mutation.expected_stale);
    return { name: mutation.name, passed: node?.status === 'possibly_stale', status: node?.status || 'missing', reason: node?.stale_reason || null };
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

export async function evaluateFixture(fixtureRoot) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-ai-eval-'));
  try {
    await fs.cp(fixtureRoot, workspace, { recursive: true });
    const spec = JSON.parse(await fs.readFile(path.join(workspace, 'evaluation.json'), 'utf8'));
    const delta = JSON.parse(await fs.readFile(path.join(workspace, 'semantic-delta.json'), 'utf8'));
    const { graph, summary } = await build(workspace); applyDelta(graph, delta);
    const tasks = spec.tasks.map((task) => {
      const packet = contextPacket(graph, task.query, task.tokens || spec.default_tokens || 800);
      const fileHits = task.expected_files.filter((file) => packet.files.includes(file));
      const factHits = task.expected_facts.filter((fact) => packet.text.includes(fact)); const negativePass = task.expect_empty ? packet.files.length === 0 && packet.nodes.length === 0 : null;
      return { name: task.name, query: task.query, tokens: packet.tokens, files: packet.files, adjacent_files: packet.adjacent_files, file_recall: task.expected_files.length ? fileHits.length / task.expected_files.length : 1, file_precision: packet.files.length ? fileHits.length / packet.files.length : 1, fact_recall: task.expected_facts.length ? factHits.length / task.expected_facts.length : 1, negative_pass: negativePass, missing_files: task.expected_files.filter((f) => !fileHits.includes(f)), missing_facts: task.expected_facts.filter((f) => !factHits.includes(f)) };
    });
    const mean = (key) => tasks.reduce((total, task) => total + task[key], 0) / tasks.length;
    const negatives = tasks.filter((task) => task.negative_pass !== null); const mutations = [];
    for (const mutation of spec.mutations || []) mutations.push(await evaluateMutation(fixtureRoot, delta, mutation));
    return { fixture: spec.name, indexed_files: Object.keys(graph.files).length, parsed_files: summary.parsed, graph_nodes: Object.keys(graph.nodes).length, graph_edges: graph.edges.length, tasks, mutations, mean_file_recall: mean('file_recall'), mean_file_precision: mean('file_precision'), mean_fact_recall: mean('fact_recall'), negative_pass_rate: negatives.length ? negatives.filter((task) => task.negative_pass).length / negatives.length : null, mutation_pass_rate: mutations.length ? mutations.filter((mutation) => mutation.passed).length / mutations.length : null, mean_tokens: mean('tokens') };
  } finally { await fs.rm(workspace, { recursive: true, force: true }); }
}
export function evaluationText(result) {
  const taskLines = result.tasks.map((task) => `${task.name}: file recall ${(task.file_recall * 100).toFixed(0)}%, precision ${(task.file_precision * 100).toFixed(0)}%, facts ${(task.fact_recall * 100).toFixed(0)}%, ${task.tokens} tokens${task.negative_pass === null ? '' : `; negative ${task.negative_pass ? 'pass' : 'fail'}`}${task.missing_files.length ? `; missing files: ${task.missing_files.join(', ')}` : ''}${task.missing_facts.length ? `; missing facts: ${task.missing_facts.join(', ')}` : ''}`);
  const mutationLines = result.mutations.map((mutation) => `- ${mutation.name}: ${mutation.passed ? 'pass' : `fail (${mutation.status})`}${mutation.reason ? ` — ${mutation.reason}` : ''}`);
  return `CONTEXT EVALUATION\nFixture: ${result.fixture}\nIndexed: ${result.indexed_files} files · ${result.graph_nodes} nodes · ${result.graph_edges} edges\nMean file recall: ${(result.mean_file_recall * 100).toFixed(1)}%\nMean file precision: ${(result.mean_file_precision * 100).toFixed(1)}%\nMean semantic fact recall: ${(result.mean_fact_recall * 100).toFixed(1)}%${result.negative_pass_rate === null ? '' : `\nNegative-query pass rate: ${(result.negative_pass_rate * 100).toFixed(1)}%`}${result.mutation_pass_rate === null ? '' : `\nStale-detection pass rate: ${(result.mutation_pass_rate * 100).toFixed(1)}%`}\nMean packet size: ${result.mean_tokens.toFixed(0)} tokens\n\nTASKS\n${taskLines.join('\n')}${mutationLines.length ? `\n\nMUTATIONS\n${mutationLines.join('\n')}` : ''}`;
}
