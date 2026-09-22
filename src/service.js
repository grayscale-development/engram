import { appendHistory, verifyHistory } from './history.js';
import { applyOperations } from './semantic.js';
import { CortexExpectedRevisionError, CortexRevisionConflictError, loadCortexWithRevision, saveCortex, validateCortex, withCortexLock } from './storage.js';

async function currentSnapshot(root) {
  const snapshot = await loadCortexWithRevision(root);
  if (!snapshot) throw new Error('no .engram/cortex.json; run engram init first');
  return snapshot;
}
async function mutate(root, expectedRevision, operation, payload, update, history) {
  if (!expectedRevision) throw new CortexExpectedRevisionError();
  return withCortexLock(root, async () => {
    const current = await currentSnapshot(root);
    if (current.revision !== expectedRevision) throw new CortexRevisionConflictError(expectedRevision, current);
    const before = structuredClone(current.cortex);
    const updateResult = await update(current.cortex);
    const next = updateResult?.cortex ?? updateResult;
    const saved = await saveCortex(root, next);
    const event = history ? await appendHistory(root, { before, beforeRevision: current.revision, cortex: saved.cortex, revision: saved.revision, operation, payload }) : null;
    return { ...saved, event, applied: updateResult?.applied ?? 1 };
  });
}

export async function readCortexSnapshot(root) { return currentSnapshot(root); }
export async function validateCortexSnapshot(root) { const snapshot = await currentSnapshot(root); return { valid: true, ...snapshot }; }
export async function applyCortexPatch(root, { expected_revision: expectedRevision, patch, history = false }) {
  return mutate(root, expectedRevision, 'apply', structuredClone(patch), (cortex) => ({ cortex, applied: applyOperations(cortex, patch) }), history);
}
export async function replaceCortex(root, { expected_revision: expectedRevision, cortex: replacement, history = false }) {
  return mutate(root, expectedRevision, 'replace', { cortex: structuredClone(replacement) }, (current) => {
    const next = validateCortex(structuredClone(replacement)); next.repository.name ||= current.repository.name; next.repository.root ||= current.repository.root || '.'; return next;
  }, history);
}
export async function verifyCortexHistory(root) { return verifyHistory(root); }
