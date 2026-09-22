import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesRoot = path.join(repositoryRoot, 'bench', 'fixtures');
const manifestPath = path.join(repositoryRoot, 'bench', 'agent-scenarios.json');
const engramCli = path.join(repositoryRoot, 'bin', 'engram.js');
const environment = { ...process.env };
delete environment.NODE_TEST_CONTEXT;

function option(args, name, fallback = null) { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1] ?? fallback; }
function usage() {
  return `Agent benchmark lab

Usage:
  npm run bench:agent -- --validate
  ENGRAM_AGENT_COMMAND='your trusted command' npm run bench:agent
  npm run bench:agent -- --list

The command runs from a disposable fixture copy with:
  ENGRAM_BENCH_REPO     fixture copy to inspect or edit
  ENGRAM_BENCH_TASK     task prompt file
  ENGRAM_BENCH_RESULT   required result Markdown file
  ENGRAM_BENCH_EVENTS   optional JSONL event output

Use --scenario id to run one scenario, --output report.json for a fixed report path,
--timeout-seconds n to change the 180-second command limit, or --keep-workspaces to inspect copies.`;
}
function run(command, options) {
  return new Promise((resolve) => {
    const child = spawn(command, { ...options, shell: true, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = ''; let stderr = ''; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, options.timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, timed_out: timedOut, stdout, stderr }); });
  });
}
async function hash(file) {
  try { return createHash('sha256').update(await fs.readFile(file)).digest('hex'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function hashes(root, paths) { return Object.fromEntries(await Promise.all(paths.map(async (file) => [file, await hash(path.join(root, file))]))); }
function matches(text, pattern) { return new RegExp(pattern, 'i').test(text); }
function latestUsage(events) {
  let usage = null;
  for (const line of events.split('\n')) {
    try { const event = JSON.parse(line); if (event.type === 'turn.completed' && event.usage) usage = event.usage; } catch { /* Event output is optional and may not be JSONL. */ }
  }
  return usage;
}
async function readManifest() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.scenarios)) throw new Error('bench/agent-scenarios.json must contain version 1 and scenarios');
  return manifest;
}
async function testCommand(root, command) { return run(command, { cwd: root, env: environment, timeoutMs: 30_000 }); }
async function evaluate({ scenario, root, before, resultFile }) {
  const checks = []; const expect = scenario.expect ?? {};
  const check = (name, pass, detail = '') => checks.push({ name, pass, detail });
  for (const file of expect.unchanged ?? []) check(`unchanged:${file}`, before[file] === await hash(path.join(root, file)));
  for (const file of expect.must_change ?? []) check(`changed:${file}`, before[file] !== await hash(path.join(root, file)));
  const report = await fs.readFile(resultFile, 'utf8').catch(() => '');
  for (const pattern of expect.report_patterns ?? []) check(`report:${pattern}`, matches(report, pattern));
  for (const assertion of expect.file_patterns ?? []) {
    const source = await fs.readFile(path.join(root, assertion.path), 'utf8').catch(() => '');
    for (const pattern of assertion.patterns) check(`file:${assertion.path}:${pattern}`, matches(source, pattern));
  }
  if (expect.cortex_evidence || expect.cortex_keywords) {
    const cortex = await fs.readFile(path.join(root, '.engram', 'cortex.json'), 'utf8').then(JSON.parse).catch(() => null);
    const entries = cortex ? Object.values(cortex.chart).filter(Array.isArray).flat() : [];
    const evidence = new Set(entries.flatMap((entry) => entry.evidence ?? [])); const keywords = entries.flatMap((entry) => entry.keywords ?? []).join(' ').toLowerCase();
    for (const file of expect.cortex_evidence ?? []) check(`cortex-evidence:${file}`, evidence.has(file));
    for (const keyword of expect.cortex_keywords ?? []) check(`cortex-keyword:${keyword}`, keywords.includes(keyword));
  }
  if (expect.test) { const tested = await testCommand(root, expect.test); check(`test:${expect.test}`, tested.code === 0, tested.stderr || tested.stdout); }
  const passed = checks.filter((item) => item.pass).length;
  return { passed, total: checks.length, checks, report_present: Boolean(report.trim()) };
}
async function runScenario(scenario, command, timeoutMs, keepWorkspace) {
  const fixture = path.join(fixturesRoot, scenario.fixture); const workspace = await fs.mkdtemp(path.join(os.tmpdir(), `engram-agent-${scenario.id}-`));
  await fs.cp(fixture, workspace, { recursive: true });
  if (scenario.prepare_cortex) await run(`${JSON.stringify(process.execPath)} ${JSON.stringify(engramCli)} init --root ${JSON.stringify(workspace)}`, { cwd: repositoryRoot, env: environment, timeoutMs: 30_000 });
  const watched = [...new Set([...(scenario.expect?.unchanged ?? []), ...(scenario.expect?.must_change ?? [])])]; const before = await hashes(workspace, watched);
  const taskFile = path.join(workspace, 'ENGRAM_BENCH_TASK.md'); const resultFile = path.join(workspace, 'ENGRAM_BENCH_RESULT.md'); const eventsFile = path.join(workspace, 'ENGRAM_BENCH_EVENTS.jsonl');
  await fs.writeFile(taskFile, `# ${scenario.id}\n\n${scenario.task}\n\nWrite your final answer to ${resultFile}.\n`);
  const started = performance.now();
  const agent = await run(command, { cwd: workspace, timeoutMs, env: { ...environment, ENGRAM_BENCH_REPO: workspace, ENGRAM_BENCH_TASK: taskFile, ENGRAM_BENCH_RESULT: resultFile, ENGRAM_BENCH_EVENTS: eventsFile } });
  const duration_ms = Math.round(performance.now() - started); const events = `${agent.stdout}\n${await fs.readFile(eventsFile, 'utf8').catch(() => '')}`;
  const evaluation = await evaluate({ scenario, root: workspace, before, resultFile });
  const result = { id: scenario.id, category: scenario.category, status: agent.code === 0 && evaluation.passed === evaluation.total ? 'passed' : 'failed', duration_ms, agent: { exit_code: agent.code, signal: agent.signal, timed_out: agent.timed_out, stderr: agent.stderr.trim() }, usage: latestUsage(events), evaluation };
  if (keepWorkspace) result.workspace = workspace; else await fs.rm(workspace, { recursive: true, force: true });
  return result;
}
function markdown(report) {
  const lines = ['# Engram agent benchmark', '', `Started: ${report.started_at}`, '', '| Scenario | Category | Score | Time | Input tokens | Status |', '| --- | --- | ---: | ---: | ---: | --- |'];
  for (const item of report.results) lines.push(`| ${item.id} | ${item.category} | ${item.evaluation.passed}/${item.evaluation.total} | ${(item.duration_ms / 1000).toFixed(2)} s | ${item.usage?.input_tokens ?? 'n/a'} | ${item.status} |`);
  return `${lines.join('\n')}\n`;
}
async function validate(manifest) {
  const results = [];
  for (const scenario of manifest.scenarios) {
    const fixture = path.join(fixturesRoot, scenario.fixture); await fs.access(path.join(fixture, 'package.json'));
    if (scenario.id === 'tenant-repair') { const baseline = await testCommand(fixture, 'npm test'); results.push({ id: scenario.id, baseline_test_fails: baseline.code !== 0 }); }
    else if (scenario.id === 'settlement-regression') { const baseline = await testCommand(fixture, 'npm test'); results.push({ id: scenario.id, baseline_test_passes: baseline.code === 0 }); }
    else results.push({ id: scenario.id, fixture_present: true });
  }
  if (results.some((result) => Object.values(result).includes(false))) throw new Error('agent benchmark fixture validation failed');
  return { valid: true, scenarios: results };
}

const args = process.argv.slice(2); const manifest = await readManifest();
if (args.includes('--help') || args.includes('-h')) process.stdout.write(`${usage()}\n`);
else if (args.includes('--list')) process.stdout.write(`${manifest.scenarios.map((item) => `${item.id}\t${item.category}\t${item.fixture}`).join('\n')}\n`);
else if (args.includes('--validate')) process.stdout.write(`${JSON.stringify(await validate(manifest), null, 2)}\n`);
else {
  const selectedId = option(args, '--scenario'); const scenarios = selectedId ? manifest.scenarios.filter((item) => item.id === selectedId) : manifest.scenarios;
  if (scenarios.length === 0) throw new Error(`unknown scenario: ${selectedId}`);
  const command = option(args, '--agent-command', process.env.ENGRAM_AGENT_COMMAND); if (!command) throw new Error('set ENGRAM_AGENT_COMMAND or pass --agent-command; run --help for the required environment variables');
  const timeoutSeconds = Number(option(args, '--timeout-seconds', '180')); if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 1800) throw new Error('--timeout-seconds must be an integer from 1 through 1800');
  const report = { version: 1, started_at: new Date().toISOString(), command_configured: true, results: [] };
  for (const scenario of scenarios) report.results.push(await runScenario(scenario, command, timeoutSeconds * 1000, args.includes('--keep-workspaces')));
  const output = path.resolve(repositoryRoot, option(args, '--output', `bench/results/agent-benchmark-${Date.now()}.json`)); await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(output.replace(/\.json$/, '.md'), markdown(report));
  process.stdout.write(`${JSON.stringify({ report: output, results: report.results.map((item) => ({ id: item.id, status: item.status, score: `${item.evaluation.passed}/${item.evaluation.total}` })) }, null, 2)}\n`);
  if (report.results.some((item) => item.status !== 'passed')) process.exitCode = 1;
}
