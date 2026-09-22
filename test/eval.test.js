import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile); const runner = path.resolve('eval/runner.mjs');
async function temporaryAdapter(script) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'engram-eval-adapter-')); const adapter = path.join(directory, 'adapter.json');
  await fs.writeFile(adapter, JSON.stringify({ schema_version: 1, id: 'test-agent', trust_level: 'unsafe-local', executable: process.execPath, args: ['-e', script], pass_env: [] })); return { directory, adapter };
}
async function run(args) { return exec(process.execPath, [runner, ...args]); }

test('eval validates suite fixtures and protected judges without an agent', async () => {
  const { stdout } = await run(['--validate']); const result = JSON.parse(stdout);
  assert.equal(result.valid, true); assert.ok(result.checks.length >= 7);
});

test('eval accepts a protected verification result in a disposable workspace', async () => {
  const script = "const fs=require('node:fs');const root=process.env.ENGRAM_EVAL_WORKSPACE;fs.appendFileSync(root+'/test/settlement.test.mjs',\"\\ntest('negative adjustment', () => { assert.equal(settlementCents({ principalCents: 1000, adjustmentCents: -25 }), 975); });\\n\");fs.writeFileSync(process.env.ENGRAM_EVAL_RESULT,JSON.stringify({summary:'verified',tests_run:['npm test']}));";
  const { directory, adapter } = await temporaryAdapter(script); const output = path.join(directory, 'result.json');
  try {
    const { stdout } = await run(['--adapter', adapter, '--unsafe-local', '--scenario', 'settlement-regression', '--output', output]); const summary = JSON.parse(stdout); const report = JSON.parse(await fs.readFile(summary.report, 'utf8'));
    assert.equal(report.trials[0].status, 'passed'); assert.deepEqual(report.trials[0].integrity.unauthorized, []);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('eval rejects an agent that changes undeclared files even when functional checks pass', async () => {
  const script = "const fs=require('node:fs');const root=process.env.ENGRAM_EVAL_WORKSPACE;fs.writeFileSync(root+'/src/transactions.mjs',\"export function updateTransaction({ actorTenantId, transactionId, body, store }) { const current=store.get(transactionId); if (!current || current.tenantId!==actorTenantId || body.tenantId!==current.tenantId) throw new Error('forbidden'); Object.assign(current, body); return current; }\\n\");fs.writeFileSync(root+'/package.json',JSON.stringify({scripts:{test:'true'}}));fs.writeFileSync(process.env.ENGRAM_EVAL_RESULT,JSON.stringify({summary:'verified',tests_run:['npm test']}));";
  const { directory, adapter } = await temporaryAdapter(script); const output = path.join(directory, 'result.json');
  try {
    await assert.rejects(run(['--adapter', adapter, '--unsafe-local', '--scenario', 'tenant-repair', '--output', output])); const report = JSON.parse(await fs.readFile(output, 'utf8'));
    assert.equal(report.trials[0].status, 'failed'); assert.deepEqual(report.trials[0].integrity.unauthorized, ['package.json']);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('paired trial evaluates fresh control and Cortex treatment agents', async () => {
  const script = "const fs=require('node:fs');const root=process.env.ENGRAM_EVAL_WORKSPACE;const task=fs.readFileSync(process.env.ENGRAM_EVAL_TASK,'utf8');if(task.includes('Create an evidence-backed Cortex')){const cortex={format_version:1,repository:{name:'tenant-ledger',root:'.'},chart:{summary:'Tenant transaction ownership.',areas:[{id:'transactions',label:'Transactions',summary:'Tenant boundary.',keywords:['transaction','tenant'],evidence:['src/transactions.mjs','test/transactions.test.mjs']}],workflows:[],decisions:[],conventions:[]}};fs.writeFileSync(root+'/.engram/cortex.json',JSON.stringify(cortex));}else{fs.writeFileSync(process.env.ENGRAM_EVAL_RESULT,JSON.stringify({answer:'yes',minimal_fix:'Authorize the loaded tenant and reject a submitted tenant mismatch before persistence.',claims:[{id:'authorization',file:'src/transactions.mjs',line:2},{id:'lookup',file:'src/transactions.mjs',line:3},{id:'persistence',file:'src/transactions.mjs',line:5}]}));}";
  const { directory, adapter } = await temporaryAdapter(script); const output = path.join(directory, 'result.json');
  try {
    const { stdout } = await run(['--adapter', adapter, '--unsafe-local', '--scenario', 'tenant-cortex-transfer', '--output', output]); const summary = JSON.parse(stdout); const report = JSON.parse(await fs.readFile(summary.report, 'utf8'));
    assert.deepEqual(report.trials.map((trial) => trial.variant).sort(), ['control', 'teacher', 'treatment']); assert.equal(report.trials.every((trial) => trial.status === 'passed'), true);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
