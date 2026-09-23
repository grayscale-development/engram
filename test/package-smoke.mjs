import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const projectRoot = path.resolve('.');

async function run(command, args, cwd) {
  return exec(command, args, { cwd, maxBuffer: 1024 * 1024 });
}

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'engram-package-smoke-'));
try {
  const packageDirectory = path.join(temporaryRoot, 'package');
  const targetRoot = path.join(temporaryRoot, 'target-repository');
  await fs.mkdir(packageDirectory);
  await fs.mkdir(targetRoot);
  await fs.writeFile(path.join(packageDirectory, 'package.json'), '{"private":true}\n');

  const { stdout: packOutput } = await run('npm', ['pack', '--json', '--pack-destination', temporaryRoot], projectRoot);
  const packed = JSON.parse(packOutput);
  assert.equal(packed.length, 1, 'npm pack should produce exactly one archive');
  const archive = path.join(temporaryRoot, packed[0].filename);
  await fs.access(archive);

  await run('npm', ['install', '--ignore-scripts', '--no-package-lock', '--no-save', archive], packageDirectory);
  const installedCli = path.join(packageDirectory, 'node_modules', '@grayscale-development', 'engram', 'bin', 'engram.js');
  await fs.access(installedCli);

  await run(process.execPath, [installedCli, 'init', '--root', targetRoot], packageDirectory);
  const runtimeCli = path.join(targetRoot, '.engram', 'runtime', 'bin', 'engram.js');
  const skill = path.join(targetRoot, '.engram', 'skills', 'cerebellum', 'SKILL.md');
  const onboardingSkill = path.join(targetRoot, '.engram', 'skills', 'onboarding', 'SKILL.md');
  const evidenceSkill = path.join(targetRoot, '.engram', 'skills', 'evidence-report', 'SKILL.md');
  const evaluationSkill = path.join(targetRoot, '.engram', 'skills', 'protected-evaluation', 'SKILL.md');
  const shadowSkill = path.join(targetRoot, '.engram', 'skills', 'shadow-mode', 'SKILL.md');
  const reviewerSkill = path.join(targetRoot, '.engram', 'skills', 'cortex-reviewer', 'SKILL.md');
  const agentInstructions = path.join(targetRoot, 'AGENTS.md');
  await Promise.all([fs.access(runtimeCli), fs.access(skill), fs.access(onboardingSkill), fs.access(evidenceSkill), fs.access(evaluationSkill), fs.access(shadowSkill), fs.access(reviewerSkill), fs.access(agentInstructions), fs.access(path.join(targetRoot, '.engram', 'shadow.json')), fs.access(path.join(targetRoot, '.engram', 'cortex.json'))]);
  assert.match(await fs.readFile(agentInstructions, 'utf8'), /Cortex reviewer/);

  const { stdout: readOutput } = await run(process.execPath, [runtimeCli, 'read', '--with-revision', '--root', targetRoot], targetRoot);
  const snapshot = JSON.parse(readOutput);
  assert.equal(snapshot.cortex.repository.root, '.');
  assert.match(snapshot.revision, /^[a-f0-9]{64}$/);
  await run(process.execPath, [runtimeCli, 'validate', '--root', targetRoot], targetRoot);
  const { stdout: focusOutput } = await run(process.execPath, [runtimeCli, 'focus', '--query', 'packaged reviewer', '--root', targetRoot], targetRoot);
  const focused = JSON.parse(focusOutput); assert.match(focused.shadow.observation_id, /^[a-f0-9-]{36}$/i);
  await run(process.execPath, [runtimeCli, 'shadow', 'review', '--observation-id', focused.shadow.observation_id, '--domain', 'packaging', '--verdict', 'inconclusive', '--root', targetRoot], targetRoot);
  const { stdout: shadowOutput } = await run(process.execPath, [runtimeCli, 'shadow', 'report', '--json', '--root', targetRoot], targetRoot);
  assert.equal(JSON.parse(shadowOutput).reviews, 1);

  process.stdout.write('Package smoke test passed: packed install initialized and ran its local runtime.\n');
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
