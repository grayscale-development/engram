import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CEREBELLUM_PATH, CORTEX_PATH } from './constants.js';
import { emptyCortex, loadCortex, saveCortex, validateCortex } from './storage.js';
import { applyOperations, readJson } from './semantic.js';

const help = `Engram — an agent-maintained repository cortex\n\nCommands:\n  init [--root path]                 create the Cortex and install the Cerebellum\n  read [--root path]                 print the Cortex\n  replace --input cortex.json        replace the Cortex with an agent-authored chart\n  apply --input patch.json           apply agent-authored CRUD operations\n  status [--root path]               show Cortex counts\n  validate [--root path]             validate the stored Cortex\n\nEngram never scans, parses, or derives facts from source code. Agents maintain the Cortex through the installed Cerebellum.`;
const option = (args, name, fallback = null) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const rootFor = (args) => path.resolve(option(args, '--root', process.cwd()));
const inputFor = (args, root) => { const input = option(args, '--input'); if (!input) throw new Error('--input is required'); return input === '-' ? '-' : path.resolve(root, input); };
const requireCortex = async (root) => { const cortex = await loadCortex(root); if (!cortex) throw new Error(`no ${CORTEX_PATH}; run engram init first`); return cortex; };
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function installSkill(root) {
  const source = path.join(sourceRoot, 'skills', 'cerebellum', 'SKILL.md'); const target = path.join(root, CEREBELLUM_PATH);
  await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(source, target);
}
function status(cortex) {
  const chart = cortex.chart;
  return `CORTEX\nRepository: ${cortex.repository.name}\nUpdated: ${cortex.updated_at}\nSummary: ${chart.summary || 'Not written yet'}\nAreas: ${chart.areas.length}\nWorkflows: ${chart.workflows.length}\nDecisions: ${chart.decisions.length}\nConventions: ${chart.conventions.length}`;
}

export async function run(args) {
  const command = args[0]; const root = rootFor(args);
  if (!command || ['help', '--help', '-h'].includes(command)) return process.stdout.write(`${help}\n`);
  if (command === 'init') {
    let cortex = await loadCortex(root); const created = !cortex; if (!cortex) cortex = emptyCortex(root); await saveCortex(root, cortex); await installSkill(root);
    return process.stdout.write(`Engram ${created ? 'initialized' : 'ready'}.\nCortex: ${created ? CORTEX_PATH : 'existing Cortex preserved'}\nCerebellum: ${CEREBELLUM_PATH}\nNext: have your agent read the Cerebellum and write the first Cortex chart.\n`);
  }
  const cortex = await requireCortex(root);
  if (command === 'read') return process.stdout.write(`${JSON.stringify(cortex, null, 2)}\n`);
  if (command === 'status') return process.stdout.write(`${status(cortex)}\n`);
  if (command === 'validate') { validateCortex(cortex); return process.stdout.write(`Valid: ${CORTEX_PATH}\n`); }
  if (command === 'replace') {
    const replacement = validateCortex(await readJson(inputFor(args, root))); replacement.repository.name ||= cortex.repository.name; replacement.repository.root ||= '.'; await saveCortex(root, replacement);
    return process.stdout.write(`Cortex replaced: ${CORTEX_PATH}\n`);
  }
  if (command === 'apply') { const applied = applyOperations(cortex, await readJson(inputFor(args, root))); await saveCortex(root, cortex); return process.stdout.write(`Cortex updated: ${applied} operation${applied === 1 ? '' : 's'}\n`); }
  throw new Error(`unknown command: ${command}`);
}
