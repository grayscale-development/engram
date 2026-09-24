import fs from 'node:fs/promises';
import path from 'node:path';
import { hasManagedAgentInstructions } from './agent-instructions.js';
import { CEREBELLUM_PATH, CORTEX_PATH, RUNTIME_PATH } from './constants.js';
import { evidenceSettings } from './evidence.js';
import { shadowSettings } from './shadow.js';
import { validateCortexSnapshot } from './service.js';

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

async function installedVersion(root) {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(root, RUNTIME_PATH, 'package.json'), 'utf8'));
    return typeof manifest.engram_version === 'string' ? manifest.engram_version : null;
  } catch { return null; }
}
function compareVersions(left, right) {
  const numeric = (value) => value.split('-', 1)[0].split('.').map((part) => Number(part));
  const a = numeric(left); const b = numeric(right);
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some((part) => !Number.isInteger(part) || part < 0)) return null;
  for (let index = 0; index < 3; index++) { if (a[index] !== b[index]) return a[index] - b[index]; }
  return 0;
}
async function latestPublishedVersion() {
  const response = await fetch('https://raw.githubusercontent.com/grayscale-development/engram/main/package.json', { signal: AbortSignal.timeout(3_000) });
  if (!response.ok) throw new Error(`update check returned HTTP ${response.status}`);
  const manifest = await response.json();
  if (!manifest || typeof manifest.version !== 'string') throw new Error('update check returned no package version');
  return manifest.version;
}
async function checkConfiguration(root) {
  const checks = await Promise.all([
    validateCortexSnapshot(root).then(() => true).catch(() => false),
    evidenceSettings(root).then(() => true).catch(() => false),
    shadowSettings(root).then(() => true).catch(() => false)
  ]);
  return [
    { id: 'cortex-valid', path: path.join(root, CORTEX_PATH), required: true, present: checks[0] },
    { id: 'evidence-settings-valid', path: path.join(root, '.engram', 'evidence.json'), required: true, present: checks[1] },
    { id: 'shadow-settings-valid', path: path.join(root, '.engram', 'shadow.json'), required: true, present: checks[2] }
  ];
}

export async function doctorReport(root, { checkUpdate = false, getLatestVersion = latestPublishedVersion } = {}) {
  const checks = [
    { id: 'cortex', path: path.join(root, CORTEX_PATH), required: true },
    { id: 'runtime-cli', path: path.join(root, RUNTIME_PATH, 'bin', 'engram.js'), required: true },
    { id: 'runtime-mcp', path: mcpServerPath(root), required: true },
    { id: 'cerebellum', path: path.join(root, CEREBELLUM_PATH), required: true },
    { id: 'onboarding', path: path.join(root, '.engram', 'skills', 'onboarding', 'SKILL.md'), required: true },
    { id: 'cortex-reviewer', path: path.join(root, '.engram', 'skills', 'cortex-reviewer', 'SKILL.md'), required: true },
    { id: 'shadow-mode', path: path.join(root, '.engram', 'skills', 'shadow-mode', 'SKILL.md'), required: true },
    { id: 'shadow-settings', path: path.join(root, '.engram', 'shadow.json'), required: true },
    { id: 'evidence-report', path: path.join(root, '.engram', 'skills', 'evidence-report', 'SKILL.md'), required: true },
    { id: 'protected-evaluation', path: path.join(root, '.engram', 'skills', 'protected-evaluation', 'SKILL.md'), required: true }
  ];
  const results = await Promise.all(checks.map(async (check) => ({ ...check, present: await exists(check.path) })));
  results.push({ id: 'automatic-agent-workflow', path: path.join(root, 'AGENTS.md'), required: true, present: await hasManagedAgentInstructions(root) });
  const configuration = await checkConfiguration(root); results.push(...configuration);
  const configurationReady = results.every((check) => check.present);
  const version = await installedVersion(root);
  let update = { checked: false, status: 'not_checked', installed_version: version, latest_version: null };
  if (checkUpdate) {
    try {
      const latest = await getLatestVersion(); const comparison = version ? compareVersions(version, latest) : null;
      update = comparison === null
        ? { checked: true, status: 'unknown', installed_version: version, latest_version: latest, issue: 'installed Engram version is unavailable or invalid' }
        : comparison < 0
          ? { checked: true, status: 'update_available', installed_version: version, latest_version: latest, issue: `Engram ${latest} is available (installed ${version})` }
          : { checked: true, status: 'current', installed_version: version, latest_version: latest };
    } catch (error) { update = { checked: true, status: 'unavailable', installed_version: version, latest_version: null, issue: `could not check for updates: ${error.message}` }; }
  }
  const issues = [
    ...results.filter((check) => !check.present).map((check) => `${check.id} is missing or invalid`),
    ...(update.issue ? [update.issue] : [])
  ];
  return {
    status: !configurationReady ? 'needs_setup' : update.status === 'update_available' ? 'update_available' : 'ready',
    root,
    checks: results,
    update,
    issues,
    next: !configurationReady
      ? 'Run engram init in this repository to install the local runtime and agent skills.'
      : update.status === 'update_available'
        ? 'Ask the agent to update Engram when you are ready; the check does not modify this repository.'
      : 'Use the local runtime, repository-local skills, or mcp-config to connect an AI host.'
  };
}
