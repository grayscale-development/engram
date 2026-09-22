import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const benchmark = path.resolve('bench/agent-benchmark.mjs');

test('agent benchmark fixtures validate without calling an agent', async () => {
  const { stdout } = await exec(process.execPath, [benchmark, '--validate']);
  const result = JSON.parse(stdout);
  assert.equal(result.valid, true); assert.equal(result.scenarios.length, 4);
  assert.equal(result.scenarios.find((item) => item.id === 'tenant-repair').baseline_test_fails, true);
  assert.equal(result.scenarios.find((item) => item.id === 'settlement-regression').baseline_test_passes, true);
});

test('agent benchmark scores a disposable verification run', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'engram-agent-report-')); const report = path.join(directory, 'report.json');
  const script = "const fs=require('node:fs');const root=process.env.ENGRAM_BENCH_REPO;fs.appendFileSync(root+'/test/settlement.test.mjs',\"\\ntest('negative adjustment', () => { assert.equal(settlementCents({ principalCents: 1000, adjustmentCents: -25 }), 975); });\\n\");fs.writeFileSync(process.env.ENGRAM_BENCH_RESULT,'tests passed');";
  const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
  try {
    const { stdout } = await exec(process.execPath, [benchmark, '--scenario', 'settlement-regression', '--agent-command', command, '--output', report]);
    const summary = JSON.parse(stdout); const result = JSON.parse(await fs.readFile(summary.report, 'utf8'));
    assert.equal(result.results[0].status, 'passed'); assert.equal(result.results[0].evaluation.passed, result.results[0].evaluation.total);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
