#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';

const repository = process.argv[2] ? path.resolve(process.argv[2]) : null;
const prompt = 'Tell me about this repo.';
const graphCommand = ['--yes', 'github:grayscale-development/graph-ai'];

function run(command, args, cwd) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      const elapsed_ms = Math.round(performance.now() - started);
      if (code !== 0) return reject(new Error(`${command} ${args.join(' ')} failed in ${elapsed_ms}ms\n${stderr || stdout}`));
      resolve({ elapsed_ms, stdout, stderr });
    });
  });
}

function tokenEstimate(value) { return Math.ceil(String(value).length / 4); }

async function claudeTrial(cwd) {
  const result = await run('claude', ['-p', '--no-session-persistence', '--output-format', 'json', prompt], cwd);
  let response;
  try { response = JSON.parse(result.stdout); }
  catch { response = { result: result.stdout }; }
  const text = response.result || response.text || result.stdout;
  return {
    elapsed_ms: result.elapsed_ms,
    response_characters: text.length,
    response_tokens_estimated: tokenEstimate(text),
    claude_usage: response.usage || null,
  };
}

function fail(message) { process.stderr.write(`${message}\n`); process.exitCode = 1; }

if (!repository) fail('Usage: node scripts/measure-orientation.js /absolute/path/to/repository');
else {
  const [stat, graph, claude] = await Promise.all([
    fs.stat(repository).catch(() => null),
    fs.stat(path.join(repository, '.ai', 'graph')).catch(() => null),
    fs.stat(path.join(repository, 'CLAUDE.md')).catch(() => null),
  ]);
  if (!stat?.isDirectory()) fail(`Repository does not exist: ${repository}`);
  else if (graph || claude) fail('Refusing an existing Graph-AI or Claude setup: use a clean repository so both trials are comparable.');
  else {
    const baseline = await claudeTrial(repository);
    const initialized = await run('npx', [...graphCommand, 'init'], repository);
    const graphSize = await fs.stat(path.join(repository, '.ai', 'graph'));
    const context = await run('npx', [...graphCommand, 'context', prompt, '--tokens', '2000', '--json'], repository);
    const packet = JSON.parse(context.stdout);
    const graphAi = await claudeTrial(repository);
    const report = {
      prompt,
      repository,
      methodology: {
        baseline_clock_starts: 'Claude prompt submitted',
        graph_ai_clock_starts: 'Graph-AI init started',
        graph_ai_total_includes: ['Graph-AI initialization', 'Claude prompt and response'],
        packet_measurement: 'Collected after initialization and outside both user-journey clocks.',
      },
      baseline,
      graph_ai: {
        initialization_ms: initialized.elapsed_ms,
        graph_bytes: graphSize.size,
        context_packet_tokens: packet.tokens,
        context_start_files: packet.files.length,
        context_adjacent_files: packet.adjacent_files.length,
        claude: graphAi,
        total_ms: initialized.elapsed_ms + graphAi.elapsed_ms,
      },
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}
