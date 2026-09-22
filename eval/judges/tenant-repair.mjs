import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, command, emit, result } from './shared.mjs';

const root = process.argv[2]; const checks = [];
try {
  const tests = await command('npm', ['test'], root); checks.push(check('public-tests', tests.code === 0, tests.stderr || tests.stdout));
  const { updateTransaction } = await import(`${pathToFileURL(`${root}/src/transactions.mjs`).href}?judge=${Date.now()}`);
  const transaction = { id: 7, tenantId: 'B', amountCents: 1000 }; const store = new Map([[7, transaction]]);
  assert.throws(() => updateTransaction({ actorTenantId: 'A', transactionId: 7, body: { tenantId: 'A', amountCents: 1 }, store }), /forbidden/);
  assert.deepEqual(transaction, { id: 7, tenantId: 'B', amountCents: 1000 }); checks.push(check('protected-cross-tenant-regression', true));
} catch (error) { checks.push(check('protected-cross-tenant-regression', false, error.message)); }
await emit(result(checks));
