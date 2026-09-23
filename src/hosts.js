import fs from 'node:fs/promises';
import path from 'node:path';
import { hasManagedAgentInstructions } from './agent-instructions.js';
import { CEREBELLUM_PATH, CORTEX_PATH, RUNTIME_PATH } from './constants.js';

export const supportedHosts = ['codex', 'cursor', 'vscode', 'generic'];

function mcpServerPath(root) {
  return path.join(root, RUNTIME_PATH, 'bin', 'engram-mcp.js');
}

function quoteToml(value) {
  return JSON.stringify(value);
}

export function mcpConfigFor(host, root) {
  const server = mcpServerPath(root);
  if (!supportedHosts.includes(host)) throw new Error(`--host must be one of: ${supportedHosts.join(', ')}`);
  if (host === 'codex') return `[mcp_servers.engram]\ncommand = "node"\nargs = [${quoteToml(server)}]\n`;
  if (host === 'cursor') return `${JSON.stringify({ mcpServers: { engram: { command: 'node', args: [server] } } }, null, 2)}\n`;
  if (host === 'vscode') return `${JSON.stringify({ servers: { engram: { type: 'stdio', command: 'node', args: [server] } } }, null, 2)}\n`;
  return `${JSON.stringify({ mcpServers: { engram: { command: 'node', args: [server] } } }, null, 2)}\n`;
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

export async function doctorReport(root) {
  const checks = [
    { id: 'cortex', path: path.join(root, CORTEX_PATH), required: true },
    { id: 'runtime-cli', path: path.join(root, RUNTIME_PATH, 'bin', 'engram.js'), required: true },
    { id: 'runtime-mcp', path: mcpServerPath(root), required: true },
    { id: 'cerebellum', path: path.join(root, CEREBELLUM_PATH), required: true },
    { id: 'onboarding', path: path.join(root, '.engram', 'skills', 'onboarding', 'SKILL.md'), required: true },
    { id: 'shadow-mode', path: path.join(root, '.engram', 'skills', 'shadow-mode', 'SKILL.md'), required: true },
    { id: 'shadow-settings', path: path.join(root, '.engram', 'shadow.json'), required: true },
    { id: 'evidence-report', path: path.join(root, '.engram', 'skills', 'evidence-report', 'SKILL.md'), required: true },
    { id: 'protected-evaluation', path: path.join(root, '.engram', 'skills', 'protected-evaluation', 'SKILL.md'), required: true }
  ];
  const results = await Promise.all(checks.map(async (check) => ({ ...check, present: await exists(check.path) })));
  results.push({ id: 'automatic-agent-workflow', path: path.join(root, 'AGENTS.md'), required: true, present: await hasManagedAgentInstructions(root) });
  return {
    status: results.every((check) => check.present) ? 'ready' : 'needs_setup',
    root,
    checks: results,
    next: results.every((check) => check.present)
      ? 'Use the local runtime, repository-local skills, or mcp-config to connect an AI host.'
      : 'Run engram init in this repository to install the local runtime and agent skills.'
  };
}
