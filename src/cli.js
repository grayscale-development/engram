import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CEREBELLUM_PATH, CORTEX_PATH, RUNTIME_PATH } from './constants.js';
import { installAgentInstructions } from './agent-instructions.js';
import { automaticEvidenceSummary, cortexEvidenceDetail, ensureEvidenceSettings, exportAutomaticEvidence, recordFocusEvidence, recordOperationEvidence } from './evidence.js';
import { doctorReport, mcpConfigFor } from './hosts.js';
import { migrationReport } from './migration.js';
import { createReportBundle } from './report-bundle.js';
import { ensureShadowSettings, recordShadowFocus, recordShadowReview, shadowGuidance, shadowReport, shadowStatus } from './shadow.js';
import { buildCortexIndex, focusCortex, readCortexIndex, searchCortexIndex, writeCortexIndex } from './index.js';
import { readJson } from './semantic.js';
import { applyCortexPatch, readCortexSnapshot, replaceCortex, validateCortexSnapshot, verifyCortexHistory } from './service.js';
import { emptyCortex, loadCortex, saveCortex } from './storage.js';

const help = `Engram — an agent-maintained repository cortex

Commands:
  init [--root path]                                      create the Cortex and install the Cerebellum
  read [--with-revision] [--pretty] [--root path]         print compact Cortex JSON; include a mutation revision when needed
  replace --input cortex.json --expected-revision hash     safely replace the Cortex
  apply --input patch.json --expected-revision hash        safely apply agent-authored CRUD operations
  focus --query words [--limit number] [--evidence-limit number] [--root path]  return a bounded task-relevant Cortex slice
  status [--root path]                                    show Cortex counts and current revision
  validate [--root path]                                  validate the stored Cortex
  history [--root path]                                   verify the optional Cortex audit history
  evidence [--export report.json] [--root path]            print or explicitly export local activity evidence
  doctor [--root path]                                    verify that the local agent workflow is ready
  mcp-config --host codex|cursor|vscode|generic [--root path]  print a host-specific local MCP configuration snippet
  bundle --output report.json [--root path]              create an explicit, redacted team handoff bundle
  migrate [--root path]                                  inspect Cortex-format migration status without changing files
  shadow report [--json] [--root path]                   show Cortex shadow-learning progress and activation
  shadow record --input review.json [--root path]        record one source-verified shadow review
  shadow review --observation-id id --domain name --verdict correct|incorrect|inconclusive [--reviewer independent] [--root path]
                                                        record a reviewer verdict without a temporary JSON file
  index --input roots.json --output index.json            derive a cross-repository index from explicit Cortex roots
  search --index index.json --query words                 search a derived Cortex index

Mutations require a revision returned by read --with-revision. Add --history to apply or replace to create an optional append-only audit event. Engram never scans, parses, or derives facts from source code.`;
const option = (args, name, fallback = null) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const requiredOption = (args, name) => { const value = option(args, name); if (!value) throw new Error(`${name} is required`); return value; };
const rootFor = (args) => path.resolve(option(args, '--root', process.cwd()));
const inputFor = (args, root) => { const input = option(args, '--input'); if (!input) throw new Error('--input is required'); return input === '-' ? '-' : path.resolve(root, input); };
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function installSkills(root) {
  const skills = [
    ['cerebellum', CEREBELLUM_PATH],
    ['onboarding', '.engram/skills/onboarding/SKILL.md'],
    ['engram-workflow', '.engram/skills/engram-workflow/SKILL.md'],
    ['evidence-report', '.engram/skills/evidence-report/SKILL.md'],
    ['protected-evaluation', '.engram/skills/protected-evaluation/SKILL.md'],
    ['shadow-mode', '.engram/skills/shadow-mode/SKILL.md'],
    ['cortex-reviewer', '.engram/skills/cortex-reviewer/SKILL.md']
  ];
  await Promise.all(skills.map(async ([name, targetPath]) => {
    const source = path.join(sourceRoot, 'skills', name, 'SKILL.md'); const target = path.join(root, targetPath);
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(source, target);
  }));
}
async function installRuntime(root) {
  const target = path.join(root, RUNTIME_PATH);
  for (const directory of ['bin', 'src']) await fs.cp(path.join(sourceRoot, directory), path.join(target, directory), { recursive: true, force: true });
  await fs.writeFile(path.join(target, 'package.json'), `${JSON.stringify({ private: true, type: 'module' })}\n`);
}
function status(snapshot) {
  const chart = snapshot.cortex.chart;
  return `CORTEX\nRepository: ${snapshot.cortex.repository.name}\nRevision: ${snapshot.revision}\nUpdated: ${snapshot.cortex.updated_at}\nSummary: ${chart.summary || 'Not written yet'}\nAreas: ${chart.areas.length}\nWorkflows: ${chart.workflows.length}\nDecisions: ${chart.decisions.length}\nConventions: ${chart.conventions.length}`;
}

export async function run(args) {
  const command = args[0]; const root = rootFor(args);
  if (!command || ['help', '--help', '-h'].includes(command)) return process.stdout.write(`${help}\n`);
  if (command === 'init') {
    const startedAt = Date.now(); const cortex = await loadCortex(root); const created = !cortex;
    if (!cortex) await saveCortex(root, emptyCortex(root));
    await Promise.all([installSkills(root), installRuntime(root), installAgentInstructions(root), ensureEvidenceSettings(root), ensureShadowSettings(root)]);
    await recordOperationEvidence(root, { operation: 'init', source: 'cli', startedAt, detail: { cortex_created: created, local_runtime_installed: true } });
    return process.stdout.write(`Engram ${created ? 'initialized' : 'ready'}.\nNext: ask your agent to read .engram/skills/onboarding/SKILL.md.\n`);
  }
  if (command === 'read') {
    const startedAt = Date.now(); const snapshot = await readCortexSnapshot(root); const output = args.includes('--with-revision') ? snapshot : snapshot.cortex;
    await recordOperationEvidence(root, { operation: 'read', source: 'cli', startedAt });
    return process.stdout.write(`${JSON.stringify(output, null, args.includes('--pretty') ? 2 : undefined)}\n`);
  }
  if (command === 'focus') {
    const startedAt = Date.now(); const limit = Number(option(args, '--limit', '5')); const evidenceLimit = Number(option(args, '--evidence-limit', '5'));
    const snapshot = await readCortexSnapshot(root); const focused = focusCortex(snapshot, requiredOption(args, '--query'), limit, evidenceLimit);
    await recordFocusEvidence(root, { source: 'cli', startedAt, snapshot, focus: focused });
    const observationId = await recordShadowFocus(root, { source: 'cli', focus: focused }); focused.shadow = await shadowGuidance(root, observationId);
    return process.stdout.write(`${JSON.stringify(focused)}\n`);
  }
  if (command === 'status') {
    const startedAt = Date.now(); const output = status(await readCortexSnapshot(root)); await recordOperationEvidence(root, { operation: 'status', source: 'cli', startedAt });
    return process.stdout.write(`${output}\n`);
  }
  if (command === 'validate') {
    const startedAt = Date.now(); const snapshot = await validateCortexSnapshot(root); await recordOperationEvidence(root, { operation: 'validate', source: 'cli', startedAt });
    return process.stdout.write(`Valid: ${CORTEX_PATH}\nRevision: ${snapshot.revision}\n`);
  }
  if (command === 'replace') {
    const startedAt = Date.now(); const replacement = await readJson(inputFor(args, root)); const result = await replaceCortex(root, { expected_revision: requiredOption(args, '--expected-revision'), cortex: replacement, history: args.includes('--history') }); await recordOperationEvidence(root, { operation: 'replace', source: 'cli', startedAt, detail: cortexEvidenceDetail(result.cortex) });
    return process.stdout.write(`Cortex replaced: ${CORTEX_PATH}\nRevision: ${result.revision}\n`);
  }
  if (command === 'apply') {
    const startedAt = Date.now(); const patch = await readJson(inputFor(args, root)); const result = await applyCortexPatch(root, { expected_revision: requiredOption(args, '--expected-revision'), patch, history: args.includes('--history') }); await recordOperationEvidence(root, { operation: 'apply', source: 'cli', startedAt, detail: cortexEvidenceDetail(result.cortex) });
    return process.stdout.write(`Cortex updated: ${result.applied} operation${result.applied === 1 ? '' : 's'}\nRevision: ${result.revision}\n`);
  }
  if (command === 'history') { const startedAt = Date.now(); const result = await verifyCortexHistory(root); await recordOperationEvidence(root, { operation: 'history', source: 'cli', startedAt }); return process.stdout.write(`${JSON.stringify(result)}\n`); }
  if (command === 'evidence') {
    const startedAt = Date.now(); const output = option(args, '--export');
    if (!output) return process.stdout.write(`${JSON.stringify(await automaticEvidenceSummary(root))}\n`);
    const result = await exportAutomaticEvidence(root, path.resolve(root, output));
    await recordOperationEvidence(root, { operation: 'evidence-export', source: 'cli', startedAt });
    return process.stdout.write(`Evidence exported: ${result.output}\nEvents: ${result.events}\n`);
  }
  if (command === 'doctor') return process.stdout.write(`${JSON.stringify(await doctorReport(root), null, 2)}\n`);
  if (command === 'mcp-config') return process.stdout.write(mcpConfigFor(requiredOption(args, '--host'), root));
  if (command === 'migrate') return process.stdout.write(`${JSON.stringify(await migrationReport(root), null, 2)}\n`);
  if (command === 'shadow') {
    const action = args[1] ?? 'report';
    if (action === 'report' || action === 'status') {
      const output = await shadowStatus(root); return process.stdout.write(args.includes('--json') ? `${JSON.stringify(output, null, 2)}\n` : `${shadowReport(output)}\n`);
    }
    if (action === 'record' || action === 'review') {
      const review = action === 'record'
        ? await readJson(inputFor(args.slice(1), root))
        : { observation_id: requiredOption(args, '--observation-id'), domain: requiredOption(args, '--domain'), reviewer: option(args, '--reviewer', 'independent'), verdict: requiredOption(args, '--verdict') };
      const startedAt = Date.now(); const report = await recordShadowReview(root, review);
      await recordOperationEvidence(root, { operation: 'shadow-review', source: 'cli', startedAt }); return process.stdout.write(`${shadowReport(report)}\n`);
    }
    throw new Error('shadow supports report, status, record, or review');
  }
  if (command === 'bundle') {
    const startedAt = Date.now(); const result = await createReportBundle(root, path.resolve(root, requiredOption(args, '--output')));
    await recordOperationEvidence(root, { operation: 'bundle', source: 'cli', startedAt });
    return process.stdout.write(`Bundle written: ${result.output}\nRevision: ${result.revision}\n`);
  }
  if (command === 'index') {
    const startedAt = Date.now(); const configuration = await readJson(inputFor(args, root)); const index = await buildCortexIndex(configuration.roots); const output = path.resolve(root, requiredOption(args, '--output'));
    await writeCortexIndex(output, index); await recordOperationEvidence(root, { operation: 'index', source: 'cli', startedAt }); return process.stdout.write(`Index written: ${output}\nRepositories: ${index.repositories.length}\n`);
  }
  if (command === 'search') { const startedAt = Date.now(); const result = searchCortexIndex(await readCortexIndex(path.resolve(root, requiredOption(args, '--index'))), requiredOption(args, '--query')); await recordOperationEvidence(root, { operation: 'search', source: 'cli', startedAt }); return process.stdout.write(`${JSON.stringify(result)}\n`); }
  throw new Error(`unknown command: ${command}`);
}
