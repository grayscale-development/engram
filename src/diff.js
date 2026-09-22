import { build } from './indexer.js';

export async function previewDiff(root, graph) {
  const before = structuredClone(graph); const { graph: after, summary } = await build(root, structuredClone(graph));
  const beforeNodes = new Set(Object.keys(before.nodes)); const afterNodes = new Set(Object.keys(after.nodes));
  const edgeKey = (edge) => `${edge.type}\u0000${edge.from}\u0000${edge.to}`;
  const beforeEdges = new Set(before.edges.map(edgeKey)); const afterEdges = new Set(after.edges.map(edgeKey));
  const becameStale = Object.values(after.nodes).filter((node) => node.status === 'possibly_stale' && before.nodes[node.id]?.status !== 'possibly_stale').map((node) => ({ id: node.id, label: node.label, reason: node.stale_reason }));
  return { files: { added: summary.added, modified: summary.modified, deleted: summary.deleted }, structural: { nodes_added: [...afterNodes].filter((id) => !beforeNodes.has(id)).length, nodes_deleted: [...beforeNodes].filter((id) => !afterNodes.has(id)).length, edges_added: [...afterEdges].filter((id) => !beforeEdges.has(id)).length, edges_deleted: [...beforeEdges].filter((id) => !afterEdges.has(id)).length }, semantic: { newly_stale: becameStale }, graph_would_change: Boolean(summary.added.length || summary.modified.length || summary.deleted.length) };
}
export function diffText(diff) {
  const lines = ['GRAPH-AI DIFF', `Graph would change: ${diff.graph_would_change ? 'yes' : 'no'}`, `FILES\nAdded: ${diff.files.added.length} · Modified: ${diff.files.modified.length} · Deleted: ${diff.files.deleted.length}`, `STRUCTURE\nNodes: +${diff.structural.nodes_added} / -${diff.structural.nodes_deleted}\nEdges: +${diff.structural.edges_added} / -${diff.structural.edges_deleted}`];
  if (diff.files.added.length || diff.files.modified.length || diff.files.deleted.length) lines.push(`\nPATHS\n${[...diff.files.added.map((p) => `+ ${p}`), ...diff.files.modified.map((p) => `~ ${p}`), ...diff.files.deleted.map((p) => `- ${p}`)].join('\n')}`);
  if (diff.semantic.newly_stale.length) lines.push(`\nNEWLY STALE KNOWLEDGE\n${diff.semantic.newly_stale.map((node) => `- ${node.label}: ${node.reason}`).join('\n')}`);
  return lines.join('\n');
}
