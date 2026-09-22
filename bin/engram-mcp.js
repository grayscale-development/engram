#!/usr/bin/env node
import { handleMcpRequest, mcpError } from '../src/mcp.js';

let buffered = '';
function respond(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }
async function receive(line) {
  let request;
  try { request = JSON.parse(line); } catch { return respond({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
  if (request.id === undefined || request.id === null) return;
  try { respond({ jsonrpc: '2.0', id: request.id, result: await handleMcpRequest(request) }); }
  catch (error) { respond({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error.message, data: mcpError(error) } }); }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffered += chunk; let newline;
  while ((newline = buffered.indexOf('\n')) >= 0) { const line = buffered.slice(0, newline); buffered = buffered.slice(newline + 1); if (line.trim()) receive(line); }
});
