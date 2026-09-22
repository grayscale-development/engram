import path from 'node:path';
import { applyCortexPatch, readCortexSnapshot, replaceCortex, validateCortexSnapshot, verifyCortexHistory } from './service.js';

const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const rootProperty = { type: 'string', description: 'Absolute or current-working-directory-relative repository root.' };
export const tools = [
  { name: 'engram_read', description: 'Read the authoritative compact Cortex snapshot and its optimistic-concurrency revision.', inputSchema: schema({ root: rootProperty }) },
  { name: 'engram_replace', description: 'Replace a Cortex only when expected_revision matches the latest read. Set history true to append an audit event.', inputSchema: schema({ root: rootProperty, expected_revision: { type: 'string' }, cortex: { type: 'object' }, history: { type: 'boolean' } }, ['expected_revision', 'cortex']) },
  { name: 'engram_apply', description: 'Apply Cortex CRUD operations only when expected_revision matches the latest read. Set history true to append an audit event.', inputSchema: schema({ root: rootProperty, expected_revision: { type: 'string' }, patch: { type: 'object' }, history: { type: 'boolean' } }, ['expected_revision', 'patch']) },
  { name: 'engram_validate', description: 'Validate the current Cortex and return its revision.', inputSchema: schema({ root: rootProperty }) },
  { name: 'engram_history_verify', description: 'Verify the optional append-only Cortex history and its recoverable snapshot chain.', inputSchema: schema({ root: rootProperty }) }
];

const toolResult = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
const rootFor = (args) => path.resolve(args.root ?? process.cwd());
export async function handleMcpRequest(request) {
  const args = request.params?.arguments ?? {};
  if (request.method === 'initialize') return { protocolVersion: request.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'engram', version: '3.0.0' } };
  if (request.method === 'tools/list') return { tools };
  if (request.method !== 'tools/call') throw new Error(`unsupported MCP method: ${request.method}`);
  const root = rootFor(args);
  if (request.params?.name === 'engram_read') return toolResult(await readCortexSnapshot(root));
  if (request.params?.name === 'engram_replace') return toolResult(await replaceCortex(root, args));
  if (request.params?.name === 'engram_apply') return toolResult(await applyCortexPatch(root, args));
  if (request.params?.name === 'engram_validate') return toolResult(await validateCortexSnapshot(root));
  if (request.params?.name === 'engram_history_verify') return toolResult(await verifyCortexHistory(root));
  throw new Error(`unknown MCP tool: ${request.params?.name}`);
}
export function mcpError(error) {
  const data = { code: error.code ?? 'ENGRAM_ERROR', message: error.message };
  if (error.current) data.current = error.current;
  return data;
}
