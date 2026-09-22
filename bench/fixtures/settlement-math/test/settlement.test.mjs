import assert from 'node:assert/strict';
import test from 'node:test';
import { settlementCents } from '../src/settlement.mjs';

test('adds a positive adjustment', () => {
  assert.equal(settlementCents({ principalCents: 1000, adjustmentCents: 25 }), 1025);
});
