import fs from 'node:fs/promises';
import { check, command, emit, result } from './shared.mjs';

const root = process.argv[2]; const checks = [];
try {
  const tests = await command('npm', ['test'], root); checks.push(check('tests-pass', tests.code === 0, tests.stderr || tests.stdout));
  const source = await fs.readFile(`${root}/test/settlement.test.mjs`, 'utf8');
  checks.push(check('negative-adjustment-test', /negative adjustment/i.test(source) && /adjustmentCents:\s*-25/.test(source) && /975/.test(source)));
} catch (error) { checks.push(check('verification', false, error.message)); }
await emit(result(checks));
