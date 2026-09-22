import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CEREBELLUM_PATH, CORTEX_PATH } from './constants.js';
import { buildCortexIndex, readCortexIndex, searchCortexIndex, writeCortexIndex } from './index.js';
import { readJson } from './semantic.js';
import { applyCortexPatch, readCortexSnapshot, replaceCortex, validateCortexSnapshot, verifyCortexHistory } from './service.js';
import { emptyCortex, loadCortex, saveCortex } from './storage.js';

const help = `Engram — an agent-maintained repository cortex

Commands:
  init [--root path]                                      create the Cortex and install the Cerebellum
  read [--with-revision] [--pretty] [--root path]         print compact Cortex JSON; include a mutation revision when needed
  replace --input cortex.json --expected-revision hash     safely replace the Cortex
  apply --input patch.json --expected-revision hash        safely apply agent-authored CRUD operations
  status [--root path]                                    show Cortex counts and current revision
  validate [--root path]                                  validate the stored Cortex
  history [--root path]                                   verify the optional Cortex audit history
  index --input roots.json --output index.json            derive a cross-repository index from explicit Cortex roots
  search --index index.json --query words                 search a derived Cortex index

Mutations require a revision returned by read --with-revision. Add --history to apply or replace to create an optional append-only audit event. Engram never scans, parses, or derives facts from source code.`;
const option = (args, name, fallback = null) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const requiredOption = (args, name) => { const value = option(args, name); if (!value) throw new Error(`${name} is required`); return value; };
const rootFor = (args) => path.resolve(option(args, '--root', process.cwd()));
const inputFor = (args, root) => { const input = option(args, '--input'); if (!input) throw new Error('--input is required'); return input === '-' ? '-' : path.resolve(root, input); };
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function installSkill(root) {
  const source = path.join(sourceRoot, 'skills', 'cerebellum', 'SKILL.md'); const target = path.join(root, CEREBELLUM_PATH);
  await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(source, target);
}
function status(snapshot) {
  const chart = snapshot.cortex.chart;
  return `CORTEX\nRepository: ${snapshot.cortex.repository.name}\nRevision: ${snapshot.revision}\nUpdated: ${snapshot.cortex.updated_at}\nSummary: ${chart.summary || 'Not written yet'}\nAreas: ${chart.areas.length}\nWorkflows: ${chart.workflows.length}\nDecisions: ${chart.decisions.length}\nConventions: ${chart.conventions.length}`;
}

export async function run(args) {
  const command = args[0]; const root = rootFor(args);
  if (!command || ['help', '--help', '-h'].includes(command)) return process.stdout.write(`${help}\n`);
  if (command === 'init') {
    const cortex = await loadCortex(root); const created = !cortex; if (!cortex) await saveCortex(root, emptyCortex(root)); await installSkill(root);
    return process.stdout.write(`Engram ${created ? 'initialized' : 'ready'}.\nCortex: ${created ? CORTEX_PATH : 'existing Cortex preserved'}\nCerebellum: ${CEREBELLUM_PATH}\nNext: run read --with-revision, then have your agent read the Cerebellum and write the first Cortex chart.\n`);
  }
  if (command === 'read') {
    const snapshot = await readCortexSnapshot(root); const output = args.includes('--with-revision') ? snapshot : snapshot.cortex;
    return process.stdout.write(`${JSON.stringify(output, null, args.includes('--pretty') ? 2 : undefined)}\n`);
  }
  if (command === 'status') return process.stdout.write(`${status(await readCortexSnapshot(root))}\n`);
  if (command === 'validate') { const snapshot = await validateCortexSnapshot(root); return process.stdout.write(`Valid: ${CORTEX_PATH}\nRevision: ${snapshot.revision}\n`); }
  if (command === 'replace') {
    const replacement = await readJson(inputFor(args, root)); const result = await replaceCortex(root, { expected_revision: requiredOption(args, '--expected-revision'), cortex: replacement, history: args.includes('--history') });
    return process.stdout.write(`Cortex replaced: ${CORTEX_PATH}\nRevision: ${result.revision}\n`);
  }
  if (command === 'apply') {
    const patch = await readJson(inputFor(args, root)); const result = await applyCortexPatch(root, { expected_revision: requiredOption(args, '--expected-revision'), patch, history: args.includes('--history') });
    return process.stdout.write(`Cortex updated: ${result.applied} operation${result.applied === 1 ? '' : 's'}\nRevision: ${result.revision}\n`);
  }
  if (command === 'history') return process.stdout.write(`${JSON.stringify(await verifyCortexHistory(root))}\n`);
  if (command === 'index') {
    const configuration = await readJson(inputFor(args, root)); const index = await buildCortexIndex(configuration.roots); const output = path.resolve(root, requiredOption(args, '--output'));
    await writeCortexIndex(output, index); return process.stdout.write(`Index written: ${output}\nRepositories: ${index.repositories.length}\n`);
  }
  if (command === 'search') return process.stdout.write(`${JSON.stringify(searchCortexIndex(await readCortexIndex(path.resolve(root, requiredOption(args, '--index'))), requiredOption(args, '--query')))}\n`);
  throw new Error(`unknown command: ${command}`);
}
