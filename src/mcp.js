import path from 'node:path';
import { automaticEvidenceSummary, cortexEvidenceDetail, recordFocusEvidence, recordOperationEvidence } from './evidence.js';
import { focusCortex } from './index.js';
import { recordShadowFocus, recordShadowReview, shadowGuidance, shadowStatus } from './shadow.js';
import { applyCortexPatch, readCortexSnapshot, replaceCortex, validateCortexSnapshot, verifyCortexHistory } from './service.js';

const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const rootProperty = { type: 'string', description: 'Absolute or current-working-directory-relative repository root.' };
export const tools = [
  { name: 'engram_read', description: 'Read the authoritative compact Cortex snapshot and its optimistic-concurrency revision.', inputSchema: schema({ root: rootProperty }) },
  { name: 'engram_focus', description: 'Return a bounded task-relevant Cortex slice, evidence-opening queue, and correctness gate. Use it to navigate, then verify the cited source.', inputSchema: schema({ root: rootProperty, query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 50 }, evidence_limit: { type: 'integer', minimum: 1, maximum: 20 } }, ['query']) },
  { name: 'engram_replace', description: 'Replace a Cortex only when expected_revision matches the latest read. Set history true to append an audit event.', inputSchema: schema({ root: rootProperty, expected_revision: { type: 'string' }, cortex: { type: 'object' }, history: { type: 'boolean' } }, ['expected_revision', 'cortex']) },
  { name: 'engram_apply', description: 'Apply Cortex CRUD operations only when expected_revision matches the latest read. Set history true to append an audit event.', inputSchema: schema({ root: rootProperty, expected_revision: { type: 'string' }, patch: { type: 'object' }, history: { type: 'boolean' } }, ['expected_revision', 'patch']) },
  { name: 'engram_validate', description: 'Validate the current Cortex and return its revision.', inputSchema: schema({ root: rootProperty }) },
  { name: 'engram_history_verify', description: 'Verify the optional append-only Cortex history and its recoverable snapshot chain.', inputSchema: schema({ root: rootProperty }) },
  { name: 'engram_evidence', description: 'Read automatically recorded local Engram activity and estimated Cortex-context reduction. This is not a measured task outcome.', inputSchema: schema({ root: rootProperty }) },
  { name: 'engram_shadow_report', description: 'Report whether the Cortex is observing, calibrating, improving, or eligible for assisted focus. Promotion requires independent source-verified reviews; this is not task-success proof.', inputSchema: schema({ root: rootProperty }) },
  { name: 'engram_shadow_record', description: 'Record one source-verified shadow review for a focus observation. The reviewer must be independent or self; only independent correct/incorrect reviews count toward promotion.', inputSchema: schema({ root: rootProperty, observation_id: { type: 'string' }, domain: { type: 'string' }, reviewer: { type: 'string', enum: ['independent', 'self'] }, verdict: { type: 'string', enum: ['correct', 'incorrect', 'inconclusive'] } }, ['observation_id', 'domain', 'reviewer', 'verdict']) }
];

const toolResult = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
const rootFor = (args) => path.resolve(args.root ?? process.cwd());
async function observed(root, operation, action) {
  const startedAt = Date.now();
  try {
    const result = await action();
    await recordOperationEvidence(root, { operation, source: 'mcp', startedAt, detail: result?.cortex ? cortexEvidenceDetail(result.cortex) : null });
    return result;
  } catch (error) {
    await recordOperationEvidence(root, { operation, source: 'mcp', startedAt, outcome: 'error', detail: { error_code: error?.code ?? 'ENGRAM_ERROR' } });
    throw error;
  }
}
async function observedFocus(root, args) {
  const startedAt = Date.now();
  try {
    const snapshot = await readCortexSnapshot(root); const focus = focusCortex(snapshot, args.query, args.limit ?? 5, args.evidence_limit ?? 5);
    await recordFocusEvidence(root, { source: 'mcp', startedAt, snapshot, focus });
    const observationId = await recordShadowFocus(root, { source: 'mcp', focus }); focus.shadow = await shadowGuidance(root, observationId);
    return focus;
  } catch (error) {
    await recordOperationEvidence(root, { operation: 'focus', source: 'mcp', startedAt, outcome: 'error', detail: { error_code: error?.code ?? 'ENGRAM_ERROR' } });
    throw error;
  }
}
export async function handleMcpRequest(request) {
  const args = request.params?.arguments ?? {};
  if (request.method === 'initialize') return { protocolVersion: request.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'engram', version: '3.2.0' } };
  if (request.method === 'tools/list') return { tools };
  if (request.method !== 'tools/call') throw new Error(`unsupported MCP method: ${request.method}`);
  const root = rootFor(args);
  if (request.params?.name === 'engram_read') return toolResult(await observed(root, 'read', () => readCortexSnapshot(root)));
  if (request.params?.name === 'engram_focus') return toolResult(await observedFocus(root, args));
  if (request.params?.name === 'engram_replace') return toolResult(await observed(root, 'replace', () => replaceCortex(root, args)));
  if (request.params?.name === 'engram_apply') return toolResult(await observed(root, 'apply', () => applyCortexPatch(root, args)));
  if (request.params?.name === 'engram_validate') return toolResult(await observed(root, 'validate', () => validateCortexSnapshot(root)));
  if (request.params?.name === 'engram_history_verify') return toolResult(await observed(root, 'history', () => verifyCortexHistory(root)));
  if (request.params?.name === 'engram_evidence') return toolResult(await automaticEvidenceSummary(root));
  if (request.params?.name === 'engram_shadow_report') return toolResult(await shadowStatus(root));
  if (request.params?.name === 'engram_shadow_record') return toolResult(await recordShadowReview(root, args));
  throw new Error(`unknown MCP tool: ${request.params?.name}`);
}
export function mcpError(error) {
  const data = { code: error.code ?? 'ENGRAM_ERROR', message: error.message };
  if (error.current) data.current = error.current;
  return data;
}
