import { check, emit, line, readResult, result } from './shared.mjs';

const root = process.argv[2]; const checks = [];
try {
  const output = await readResult(root); const claimList = Array.isArray(output.claims) ? output.claims : Object.entries(output.claims ?? {}).map(([id, claim]) => ({ id, ...claim })); const claims = new Map(claimList.map((claim) => [claim.id, claim]));
  checks.push(check('answer-is-yes', output.answer === 'yes'));
  checks.push(check('minimal-fix', typeof output.minimal_fix === 'string' && output.minimal_fix.trim().length >= 20));
  for (const expected of [
    ['authorization', /actorTenantId.*body\.tenantId/],
    ['lookup', /store\.get\(transactionId\)/],
    ['persistence', /Object\.assign\(current, body\)/]
  ]) {
    const [id, pattern] = expected; const claim = claims.get(id); const cited = claim && typeof claim.file === 'string' && Number.isInteger(claim.line) && claim.line > 0;
    checks.push(check(`claim:${id}:shape`, cited));
    checks.push(check(`claim:${id}:evidence`, cited && claim.file === 'src/transactions.mjs' && pattern.test(await line(root, claim.file, claim.line))));
  }
} catch (error) { checks.push(check('valid-result-json', false, error.message)); }
await emit(result(checks));
