import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultSuite = 'eval/suites/core-v1.json';
const generated = new Set(['EVAL_TASK.md', 'RESULT.json', 'agent.events.jsonl']);
const MAX_PROCESS_OUTPUT_BYTES = 16 * 1024 * 1024;
const option = (args, name, fallback = null) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1] ?? fallback; };
const sha = (value) => createHash('sha256').update(value).digest('hex');

function usage() {
  return `Engram eval v2

  npm run eval -- --validate
  npm run eval -- --list
  npm run eval -- --adapter eval/adapters/codex-local.json --unsafe-local --repetitions 5

The runner accepts an adapter JSON, never a shell command. Protected judges run outside each
agent workspace. Use --unsafe-local only for an explicitly local/trusted adapter; use a
container adapter for untrusted or production comparisons.`;
}
function processResult(executable, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { cwd: options.cwd, env: options.env, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = ''; let stderr = ''; let timedOut = false; let outputLimited = false; let forced;
    const stop = (signal) => { try { if (process.platform !== 'win32') process.kill(-child.pid, signal); else child.kill(signal); } catch { /* The process already exited. */ } };
    const timer = setTimeout(() => { timedOut = true; stop('SIGTERM'); forced = setTimeout(() => stop('SIGKILL'), 5_000); }, options.timeoutMs ?? 180_000);
    const append = (target, chunk) => { const value = chunk.toString(); if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + Buffer.byteLength(value) > MAX_PROCESS_OUTPUT_BYTES) { outputLimited = true; stop('SIGTERM'); return target; } return target + value; };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); }); child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.on('close', (code, signal) => { clearTimeout(timer); if (forced) clearTimeout(forced); resolve({ code, signal, timed_out: timedOut, output_limited: outputLimited, stdout, stderr }); });
  });
}
async function regularFiles(root, relative = '') {
  const directory = path.join(root, relative); const entries = await fs.readdir(directory, { withFileTypes: true }); const files = [];
  for (const entry of entries) {
    const file = path.join(relative, entry.name);
    if (generated.has(file)) continue;
    if (entry.isDirectory()) files.push(...await regularFiles(root, file));
    else if (entry.isFile()) files.push(file);
    else files.push(`${file}:unsupported`);
  }
  return files.sort();
}
async function snapshot(root) {
  const files = await regularFiles(root); const values = {};
  for (const file of files) values[file] = file.endsWith(':unsupported') ? 'unsupported' : sha(await fs.readFile(path.join(root, file)));
  return values;
}
function isAllowed(file, allowed) { return allowed.some((pattern) => pattern === file || (pattern.endsWith('/**') && file.startsWith(pattern.slice(0, -1)))); }
async function diff(root, before, allowed) {
  const after = await snapshot(root); const paths = new Set([...Object.keys(before), ...Object.keys(after)]); const changed = [...paths].filter((file) => before[file] !== after[file]).sort();
  return { changed, unauthorized: changed.filter((file) => !isAllowed(file, allowed)) };
}
function usageFrom(events) {
  const totals = {}; let turns = 0;
  for (const line of events.split('\n')) {
    try {
      const event = JSON.parse(line); if (event.type !== 'turn.completed' || !event.usage) continue; turns++;
      for (const [key, value] of Object.entries(event.usage)) if (typeof value === 'number') totals[key] = (totals[key] ?? 0) + value;
    } catch { /* Adapter output need not be JSONL. */ }
  }
  return turns ? { turns, ...totals } : null;
}
async function readJson(file, description) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { throw new Error(`${description} is invalid: ${error.message}`); }
}
async function loadAdapter(file) {
  const adapter = await readJson(file, 'adapter');
  if (adapter.schema_version !== 1 || typeof adapter.id !== 'string' || !Array.isArray(adapter.args)) throw new Error('adapter needs schema_version 1, id, and args');
  adapter.executor ??= 'local';
  if (adapter.executor === 'local' && typeof adapter.executable !== 'string') throw new Error('local adapter needs executable');
  if (adapter.executor === 'container' && (typeof adapter.image !== 'string' || typeof adapter.command !== 'string')) throw new Error('container adapter needs image and command');
  if (!['local', 'container'].includes(adapter.executor)) throw new Error('adapter executor must be local or container');
  if (adapter.args.some((arg) => typeof arg !== 'string')) throw new Error('adapter args must be strings');
  return adapter;
}
async function loadSuite(file) {
  const suite = await readJson(file, 'suite');
  if (suite.schema_version !== 1 || typeof suite.suite_id !== 'string' || !Array.isArray(suite.scenarios) || !Array.isArray(suite.paired_scenarios)) throw new Error('suite needs schema_version 1, suite_id, scenarios, and paired_scenarios');
  const ids = [...suite.scenarios, ...suite.paired_scenarios].map((scenario) => scenario.id); if (new Set(ids).size !== ids.length) throw new Error('scenario ids must be unique');
  return suite;
}
function agentEnvironment(adapter, workspace, task, result) {
  const environment = { PATH: process.env.PATH ?? '', LANG: process.env.LANG ?? 'C.UTF-8', LC_ALL: process.env.LC_ALL ?? 'C.UTF-8', ENGRAM_EVAL_WORKSPACE: workspace, ENGRAM_EVAL_TASK: task, ENGRAM_EVAL_RESULT: result };
  for (const key of adapter.pass_env ?? []) if (process.env[key] !== undefined) environment[key] = process.env[key];
  return environment;
}
function expand(value, fields) { return value.replaceAll('{workspace}', fields.workspace).replaceAll('{task}', fields.task).replaceAll('{prompt}', fields.prompt).replaceAll('{result}', fields.result); }
function adapterInvocation(adapter, hostFields) {
  if (adapter.executor === 'local') return { executable: adapter.executable, args: adapter.args.map((arg) => expand(arg, hostFields)), env: agentEnvironment(adapter, hostFields.workspace, hostFields.task, hostFields.result) };
  const fields = { ...hostFields, workspace: '/workspace', task: '/workspace/EVAL_TASK.md', result: '/workspace/RESULT.json' };
  const environment = agentEnvironment(adapter, fields.workspace, fields.task, fields.result); const args = ['run', '--rm', '--network', adapter.network ?? 'none', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '--mount', `type=bind,source=${hostFields.workspace},target=/workspace`, '--workdir', '/workspace'];
  for (const key of adapter.pass_env ?? []) if (environment[key] !== undefined) args.push('--env', `${key}=${environment[key]}`);
  args.push('--env', `ENGRAM_EVAL_WORKSPACE=${fields.workspace}`, '--env', `ENGRAM_EVAL_TASK=${fields.task}`, '--env', `ENGRAM_EVAL_RESULT=${fields.result}`, adapter.image, adapter.command, ...adapter.args.map((arg) => expand(arg, fields)));
  return { executable: 'docker', args, env: { PATH: process.env.PATH ?? '', LANG: environment.LANG, LC_ALL: environment.LC_ALL } };
}
async function initializeCortex(root) {
  const completed = await processResult(process.execPath, [path.join(repositoryRoot, 'bin', 'engram.js'), 'init', '--root', root], { cwd: repositoryRoot, env: process.env, timeoutMs: 30_000 });
  if (completed.code !== 0) throw new Error(`could not initialize Cortex: ${completed.stderr || completed.stdout}`);
}
async function workspaceFor(fixture, cortex = false) {
  const source = path.join(repositoryRoot, 'eval', 'fixtures', fixture); const workspace = await fs.mkdtemp(path.join(os.tmpdir(), `engram-eval-${fixture}-`));
  await fs.cp(source, workspace, { recursive: true }); if (cortex) await initializeCortex(workspace); return workspace;
}
async function judge(file, workspace) {
  const completed = await processResult(process.execPath, [path.join(repositoryRoot, file), workspace], { cwd: repositoryRoot, env: process.env, timeoutMs: 30_000 });
  try { return { process: completed, verdict: JSON.parse(completed.stdout) }; } catch { return { process: completed, verdict: { passed: false, checks: [{ name: 'judge-output', pass: false, detail: completed.stderr || completed.stdout }] } }; }
}
async function invoke({ adapter, workspace, prompt, timeoutMs }) {
  const task = path.join(workspace, 'EVAL_TASK.md'); const result = path.join(workspace, 'RESULT.json');
  await fs.writeFile(task, `${prompt}\n\nWrite only the requested JSON artifact to RESULT.json.\n`); await fs.writeFile(result, '');
  const fields = { workspace, task, prompt: await fs.readFile(task, 'utf8'), result }; const invocation = adapterInvocation(adapter, fields);
  const started = performance.now(); const completed = await processResult(invocation.executable, invocation.args, { cwd: workspace, env: invocation.env, timeoutMs }); const duration_ms = Math.round(performance.now() - started);
  await fs.writeFile(path.join(workspace, 'agent.events.jsonl'), completed.stdout);
  return { completed, duration_ms, usage: usageFrom(completed.stdout) };
}
async function trial({ scenario, adapter, prompt, allowedChanges, workspace, timeoutMs, variant, keepWorkspace, traceDirectory, pair_id = null }) {
  const id = randomUUID(); let before; let invoked; let evaluated;
  try {
    before = await snapshot(workspace); invoked = await invoke({ adapter, workspace, prompt, timeoutMs }); const changes = await diff(workspace, before, [...allowedChanges, 'RESULT.json']);
    evaluated = await judge(scenario.judge ?? scenario.student_judge ?? scenario.teacher_judge, workspace);
    const judgeFile = scenario.judge ?? scenario.student_judge ?? scenario.teacher_judge; const traceFile = path.join(traceDirectory, `${id}.jsonl`);
    await fs.writeFile(traceFile, `${invoked.completed.stdout}${invoked.completed.stderr ? `\n[stderr]\n${invoked.completed.stderr}` : ''}`);
    const integrity = { passed: changes.unauthorized.length === 0, changed: changes.changed, unauthorized: changes.unauthorized };
    const status = invoked.completed.code === 0 && !invoked.completed.output_limited && integrity.passed && evaluated.verdict.passed ? 'passed' : 'failed';
    return { id, pair_id, scenario: scenario.id, capability: scenario.capability, variant, started_at: new Date().toISOString(), duration_ms: invoked.duration_ms, usage: invoked.usage, provenance: { prompt_sha256: sha(prompt), fixture_sha256: sha(JSON.stringify(before)), judge_sha256: sha(await fs.readFile(path.join(repositoryRoot, judgeFile))) }, trace: { file: path.relative(repositoryRoot, traceFile), sha256: sha(await fs.readFile(traceFile)) }, status, agent: { exit_code: invoked.completed.code, signal: invoked.completed.signal, timed_out: invoked.completed.timed_out, output_limited: invoked.completed.output_limited, stderr: invoked.completed.stderr.trim() }, integrity, judge: evaluated.verdict, workspace: keepWorkspace ? workspace : undefined };
  } finally { if (!keepWorkspace) await fs.rm(workspace, { recursive: true, force: true }).catch(() => {}); }
}
async function standardTrial(scenario, adapter, timeoutMs, keepWorkspace, traceDirectory) {
  const workspace = await workspaceFor(scenario.fixture); return trial({ scenario, adapter, prompt: scenario.prompt, allowedChanges: scenario.allowed_changes, workspace, timeoutMs, variant: 'standard', keepWorkspace, traceDirectory });
}
async function pairedTrial(scenario, adapter, timeoutMs, repetition, keepWorkspace, traceDirectory) {
  const pair_id = randomUUID();
  const teacherWorkspace = await workspaceFor(scenario.fixture, true);
  const teacher = await trial({ scenario: { ...scenario, judge: scenario.teacher_judge }, adapter, prompt: scenario.teacher_prompt, allowedChanges: scenario.teacher_allowed_changes, workspace: teacherWorkspace, timeoutMs, variant: 'teacher', keepWorkspace: true, traceDirectory, pair_id });
  const cortex = path.join(teacherWorkspace, '.engram', 'cortex.json'); const order = repetition % 2 === 0 ? ['control', 'treatment'] : ['treatment', 'control']; const students = [];
  try {
    for (const variant of order) {
      if (variant === 'treatment' && teacher.status !== 'passed') { students.push({ id: randomUUID(), pair_id, scenario: scenario.id, capability: scenario.capability, variant, status: 'skipped', reason: 'teacher failed protected Cortex judge' }); continue; }
      const workspace = await workspaceFor(scenario.fixture, variant === 'treatment');
      if (variant === 'treatment' && teacher.status === 'passed') await fs.copyFile(cortex, path.join(workspace, '.engram', 'cortex.json'));
      students.push(await trial({ scenario, adapter, prompt: variant === 'treatment' ? scenario.treatment_prompt : scenario.control_prompt, allowedChanges: scenario.student_allowed_changes, workspace, timeoutMs, variant, keepWorkspace, traceDirectory, pair_id }));
    }
  } finally { if (!keepWorkspace) { await fs.rm(teacherWorkspace, { recursive: true, force: true }).catch(() => {}); delete teacher.workspace; } }
  return [teacher, ...students];
}
function percentile(values, quantile) { const sorted = [...values].sort((left, right) => left - right); return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? null; }
function aggregates(results) {
  const groups = new Map();
  for (const item of results) { if (item.status === 'skipped') continue; const key = `${item.scenario}:${item.variant}`; const group = groups.get(key) ?? []; group.push(item); groups.set(key, group); }
  return [...groups].map(([key, items]) => ({ key, trials: items.length, passed: items.filter((item) => item.status === 'passed').length, pass_rate: items.length ? Number((items.filter((item) => item.status === 'passed').length / items.length).toFixed(3)) : 0, duration_ms: { p50: percentile(items.map((item) => item.duration_ms), 0.5), p95: percentile(items.map((item) => item.duration_ms), 0.95) }, input_tokens: items.reduce((total, item) => total + (item.usage?.input_tokens ?? 0), 0) }));
}
function pairedComparisons(results) {
  const pairs = new Map(); for (const item of results) if (item.pair_id) { const pair = pairs.get(item.pair_id) ?? {}; pair[item.variant] = item; pairs.set(item.pair_id, pair); }
  const comparisons = [];
  for (const [pair_id, pair] of pairs) if (pair.control && pair.treatment && pair.treatment.status !== 'skipped') comparisons.push({ pair_id, teacher_status: pair.teacher?.status, control_status: pair.control.status, treatment_status: pair.treatment.status, success_delta: Number(pair.treatment.status === 'passed') - Number(pair.control.status === 'passed'), duration_ms_delta: pair.treatment.duration_ms - pair.control.duration_ms, input_tokens_delta: (pair.treatment.usage?.input_tokens ?? 0) - (pair.control.usage?.input_tokens ?? 0) });
  return { pairs: comparisons, summary: { comparable_pairs: comparisons.length, mean_success_delta: comparisons.length ? Number((comparisons.reduce((total, item) => total + item.success_delta, 0) / comparisons.length).toFixed(3)) : null, mean_duration_ms_delta: comparisons.length ? Math.round(comparisons.reduce((total, item) => total + item.duration_ms_delta, 0) / comparisons.length) : null, mean_input_tokens_delta: comparisons.length ? Math.round(comparisons.reduce((total, item) => total + item.input_tokens_delta, 0) / comparisons.length) : null } };
}
function markdown(report) {
  const lines = ['# Engram eval v2', '', `Suite: ${report.suite.id}`, `Adapter: ${report.adapter.id}`, '', '| Scenario / variant | Pass rate | Trials | p50 time | Input tokens |', '| --- | ---: | ---: | ---: | ---: |'];
  for (const item of report.aggregates) lines.push(`| ${item.key} | ${item.pass_rate} | ${item.trials} | ${item.duration_ms.p50 ?? 'n/a'} ms | ${item.input_tokens || 'n/a'} |`);
  return `${lines.join('\n')}\n`;
}
async function validate(suite) {
  const checks = [];
  for (const scenario of [...suite.scenarios, ...suite.paired_scenarios]) {
    await fs.access(path.join(repositoryRoot, 'eval', 'fixtures', scenario.fixture, 'package.json')); checks.push({ name: `fixture:${scenario.id}`, pass: true });
    for (const judgeFile of [scenario.judge, scenario.teacher_judge, scenario.student_judge].filter(Boolean)) { await fs.access(path.join(repositoryRoot, judgeFile)); checks.push({ name: `judge:${judgeFile}`, pass: true }); }
    if (typeof scenario.baseline_judge_passes === 'boolean') {
      const workspace = await workspaceFor(scenario.fixture); try { const baseline = await judge(scenario.judge, workspace); checks.push({ name: `baseline:${scenario.id}`, pass: baseline.verdict.passed === scenario.baseline_judge_passes, detail: baseline.verdict }); } finally { await fs.rm(workspace, { recursive: true, force: true }); }
    }
  }
  return { valid: checks.every((check) => check.pass), checks };
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) process.stdout.write(`${usage()}\n`);
else {
  const suitePath = path.resolve(repositoryRoot, option(args, '--suite', defaultSuite)); const suite = await loadSuite(suitePath);
  if (args.includes('--list')) process.stdout.write(`${[...suite.scenarios, ...suite.paired_scenarios].map((item) => `${item.id}\t${item.capability}`).join('\n')}\n`);
  else if (args.includes('--validate')) process.stdout.write(`${JSON.stringify(await validate(suite), null, 2)}\n`);
  else {
    const adapterPath = option(args, '--adapter'); if (!adapterPath) throw new Error('--adapter is required'); const adapter = await loadAdapter(path.resolve(repositoryRoot, adapterPath));
    if (adapter.executor === 'local' && !args.includes('--unsafe-local')) throw new Error(`adapter ${adapter.id} uses local execution; pass --unsafe-local only on a trusted development machine`);
    const selected = option(args, '--scenario'); const scenarios = [...suite.scenarios, ...suite.paired_scenarios].filter((scenario) => !selected || scenario.id === selected); if (scenarios.length === 0) throw new Error(`unknown scenario: ${selected}`);
    const repetitions = Number(option(args, '--repetitions', '1')); if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) throw new Error('--repetitions must be an integer from 1 through 100');
    const timeoutSeconds = Number(option(args, '--timeout-seconds', '180')); if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 1800) throw new Error('--timeout-seconds must be an integer from 1 through 1800');
    const run_id = randomUUID(); const output = path.resolve(repositoryRoot, option(args, '--output', `eval/results/${run_id}.json`)); if (path.extname(output) !== '.json') throw new Error('--output must end in .json'); const traceDirectory = output.replace(/\.json$/, '.traces'); await fs.mkdir(traceDirectory, { recursive: true });
    const suiteSource = await fs.readFile(suitePath, 'utf8'); const adapterSource = await fs.readFile(path.resolve(repositoryRoot, adapterPath), 'utf8'); const git = await processResult('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, env: process.env, timeoutMs: 10_000 }); const pkg = await readJson(path.join(repositoryRoot, 'package.json'), 'package'); const report = { schema_version: 2, run_id, started_at: new Date().toISOString(), runner_version: pkg.version, repository_revision: git.code === 0 ? git.stdout.trim() : null, suite: { id: suite.suite_id, sha256: sha(suiteSource) }, adapter: { id: adapter.id, sha256: sha(adapterSource), trust_level: adapter.trust_level, executor: adapter.executor, metadata: adapter.metadata ?? {} }, repetitions, trials: [] };
    for (let repetition = 0; repetition < repetitions; repetition++) for (const scenario of scenarios) {
      if (suite.scenarios.includes(scenario)) report.trials.push(await standardTrial(scenario, adapter, timeoutSeconds * 1000, args.includes('--keep-workspaces'), traceDirectory));
      else report.trials.push(...await pairedTrial(scenario, adapter, timeoutSeconds * 1000, repetition, args.includes('--keep-workspaces'), traceDirectory));
    }
    report.aggregates = aggregates(report.trials); report.paired_comparisons = pairedComparisons(report.trials); await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(output.replace(/\.json$/, '.md'), markdown(report));
    process.stdout.write(`${JSON.stringify({ report: output, aggregates: report.aggregates }, null, 2)}\n`); if (report.trials.some((trial) => trial.status !== 'passed')) process.exitCode = 1;
  }
}
