import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = await mkdtemp(path.join(tmpdir(), 'graph-ai-demo-'));
try {
  await cp(path.resolve('examples/checkout-app'), root, { recursive: true });
  const cli = path.resolve('bin/graph-ai.js');
  const run = (...args) => execFileSync(process.execPath, [cli, ...args, '--root', root], { encoding: 'utf8' });
  process.stdout.write(run('init'));
  await writeFile(path.join(root, 'delta.json'), JSON.stringify({ changes: [{ type: 'product.concept', label: 'Saved card selection', statement: 'Customers can reuse saved payment methods during checkout instead of entering a new card.', evidence: ['src/saved-cards.js', 'src/checkout.js'], related: ['code:file:src/checkout.js'] }, { type: 'workflow.checkout', label: 'Checkout with saved card', statement: 'Checkout → select saved payment method → submit payment.', evidence: ['src/checkout.js'] }] }));
  process.stdout.write(run('sync', '--input', 'delta.json'));
  process.stdout.write(run('context', 'fix saved card selection at checkout', '--tokens', '500'));
} finally { await rm(root, { recursive: true, force: true }); }
