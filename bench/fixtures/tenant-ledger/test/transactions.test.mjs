import assert from 'node:assert/strict';
import test from 'node:test';
import { updateTransaction } from '../src/transactions.mjs';

test('rejects a tenant A caller updating a tenant B transaction', () => {
  const transaction = { id: 7, tenantId: 'B', amountCents: 1000 };
  const store = new Map([[7, transaction]]);
  assert.throws(() => updateTransaction({ actorTenantId: 'A', transactionId: 7, body: { tenantId: 'A', amountCents: 1 }, store }), /forbidden/);
  assert.deepEqual(transaction, { id: 7, tenantId: 'B', amountCents: 1000 });
});
