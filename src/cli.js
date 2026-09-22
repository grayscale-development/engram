import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAIN_PATH, SKILL_PATH } from './constants.js';
import { emptyBrain, loadBrain, saveBrain, validateBrain } from './storage.js';
import { applyOperations, readJson } from './semantic.js';

const help = `Graph-AI — an agent-maintained repository brain\n\nCommands:\n  init [--root path]                 create the empty brain and install the skill\n  read [--root path]                 print the brain\n  replace --input brain.json         replace the brain with an agent-authored chart\n  apply --input patch.json           apply agent-authored CRUD operations\n  status [--root path]               show chart counts\n  validate [--root path]             validate the stored brain\n\nGraph-AI never scans, parses, or derives facts from source code. Agents maintain the brain through the installed skill.`;
const option = (args, name, fallback = null) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const rootFor = (args) => path.resolve(option(args, '--root', process.cwd()));
const inputFor = (args, root) => { const input = option(args, '--input'); if (!input) throw new Error('--input is required'); return input === '-' ? '-' : path.resolve(root, input); };
const requireBrain = async (root) => { const brain = await loadBrain(root); if (!brain) throw new Error(`no ${BRAIN_PATH}; run graph-ai init first`); return brain; };
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function installSkill(root) {
  const source = path.join(sourceRoot, 'skills', 'repository-brain', 'SKILL.md'); const target = path.join(root, SKILL_PATH);
  await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(source, target);
}
function status(brain) {
  const chart = brain.chart;
  return `REPOSITORY BRAIN\nRepository: ${brain.repository.name}\nUpdated: ${brain.updated_at}\nSummary: ${chart.summary || 'Not written yet'}\nAreas: ${chart.areas.length}\nWorkflows: ${chart.workflows.length}\nDecisions: ${chart.decisions.length}\nConventions: ${chart.conventions.length}`;
}

export async function run(args) {
  const command = args[0]; const root = rootFor(args);
  if (!command || ['help', '--help', '-h'].includes(command)) return process.stdout.write(`${help}\n`);
  if (command === 'init') {
    let brain = await loadBrain(root); const created = !brain; if (!brain) brain = emptyBrain(root); await saveBrain(root, brain); await installSkill(root);
    return process.stdout.write(`Graph-AI ${created ? 'initialized' : 'ready'}.\nCreated: ${created ? BRAIN_PATH : 'existing brain preserved'}\nInstalled: ${SKILL_PATH}\nNext: have your agent read the skill and write the first chart.\n`);
  }
  const brain = await requireBrain(root);
  if (command === 'read') return process.stdout.write(`${JSON.stringify(brain, null, 2)}\n`);
  if (command === 'status') return process.stdout.write(`${status(brain)}\n`);
  if (command === 'validate') { validateBrain(brain); return process.stdout.write(`Valid: ${BRAIN_PATH}\n`); }
  if (command === 'replace') {
    const replacement = validateBrain(await readJson(inputFor(args, root))); replacement.repository.name ||= brain.repository.name; replacement.repository.root ||= '.'; await saveBrain(root, replacement);
    return process.stdout.write(`Brain replaced: ${BRAIN_PATH}\n`);
  }
  if (command === 'apply') { const applied = applyOperations(brain, await readJson(inputFor(args, root))); await saveBrain(root, brain); return process.stdout.write(`Brain updated: ${applied} operation${applied === 1 ? '' : 's'}\n`); }
  throw new Error(`unknown command: ${command}`);
}
