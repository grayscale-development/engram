import { loadCortexWithRevision } from '../../src/storage.js';
import { check, emit, result } from './shared.mjs';

const root = process.argv[2]; const checks = [];
try {
  const snapshot = await loadCortexWithRevision(root); const entries = Object.values(snapshot?.cortex.chart ?? {}).filter(Array.isArray).flat();
  const evidence = new Set(entries.flatMap((entry) => entry.evidence ?? [])); const keywords = entries.flatMap((entry) => entry.keywords ?? []).join(' ').toLowerCase();
  checks.push(check('valid-cortex', Boolean(snapshot)));
  checks.push(check('transaction-evidence', evidence.has('src/transactions.mjs')));
  checks.push(check('regression-evidence', evidence.has('test/transactions.test.mjs')));
  checks.push(check('retrieval-keywords', keywords.includes('transaction') && keywords.includes('tenant')));
} catch (error) { checks.push(check('valid-cortex', false, error.message)); }
await emit(result(checks));
