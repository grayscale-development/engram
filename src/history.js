import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HISTORY_PATH, HISTORY_SNAPSHOT_INTERVAL } from './constants.js';
import { applyOperations } from './semantic.js';
import { cortexRevision, loadCortexWithRevision, serializeCortex, validateCortex } from './storage.js';

const eventsFile = (root) => path.join(root, HISTORY_PATH, 'events.ndjson');
const snapshotsDirectory = (root) => path.join(root, HISTORY_PATH, 'snapshots');
const pendingFile = (root) => path.join(root, HISTORY_PATH, 'pending.json');
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function events(root) {
  try {
    const raw = await fs.readFile(eventsFile(root), 'utf8');
    return raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function writeSnapshot(root, revision, cortex) {
  const directory = snapshotsDirectory(root); const file = path.join(directory, `${revision}.json`); const temporary = `${file}.${process.pid}.tmp`;
  await fs.mkdir(directory, { recursive: true }); await fs.writeFile(temporary, serializeCortex(cortex)); await fs.rename(temporary, file);
}
async function snapshotRevisions(root) {
  try { return (await fs.readdir(snapshotsDirectory(root))).filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5)); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function readSnapshot(root, revision) {
  return validateCortex(JSON.parse(await fs.readFile(path.join(snapshotsDirectory(root), `${revision}.json`), 'utf8')));
}

async function pending(root) {
  try { return JSON.parse(await fs.readFile(pendingFile(root), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function writePending(root, transaction) {
  const file = pendingFile(root); const temporary = `${file}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temporary, `${JSON.stringify(transaction)}\n`);
  await fs.rename(temporary, file);
}
async function clearPending(root) {
  await fs.unlink(pendingFile(root)).catch((error) => { if (error.code !== 'ENOENT') throw error; });
}

function eventFor(previousEvents, { beforeRevision, cortex, revision, operation, payload }) {
  const core = {
    format_version: 1,
    previous_event_id: previousEvents.at(-1)?.id ?? null,
    previous_revision: beforeRevision,
    revision,
    operation,
    payload,
    updated_at: cortex.updated_at
  };
  return { ...core, id: digest(core) };
}

function replayPending(transaction, current) {
  let cortex = structuredClone(transaction.before);
  if (transaction.operation === 'apply') applyOperations(cortex, transaction.payload);
  else if (transaction.operation === 'replace') cortex = structuredClone(transaction.payload.cortex);
  else throw new Error(`unsupported pending history operation: ${transaction.operation}`);
  cortex.updated_at = current.cortex.updated_at;
  validateCortex(cortex);
  const revision = cortexRevision(serializeCortex(cortex));
  if (revision !== current.revision) throw new Error('pending history does not match the current Cortex; resolve the Cortex and history before mutating again');
  return cortex;
}

// A pending transaction is written before Cortex persistence. If a process stops
// after saving Cortex but before appending its audit event, the next history-aware
// operation can append the exact missing event without guessing.
export async function beginHistoryTransaction(root, transaction) {
  await writePending(root, { format_version: 1, ...transaction });
}

export async function reconcileHistory(root, currentSnapshot = null) {
  const transaction = await pending(root);
  if (!transaction) return { reconciled: false, state: 'none' };
  if (transaction.format_version !== 1 || !transaction.before || !transaction.before_revision || !transaction.operation) throw new Error('invalid pending history transaction');
  const current = currentSnapshot ?? await loadCortexWithRevision(root);
  if (!current) throw new Error('cannot reconcile history without a Cortex');
  if (current.revision === transaction.before_revision) {
    await clearPending(root);
    return { reconciled: true, state: 'discarded' };
  }
  replayPending(transaction, current);
  const event = await appendHistory(root, {
    before: transaction.before,
    beforeRevision: transaction.before_revision,
    cortex: current.cortex,
    revision: current.revision,
    operation: transaction.operation,
    payload: transaction.payload
  });
  await clearPending(root);
  return { reconciled: true, state: 'appended', event };
}

export async function appendHistory(root, { before, beforeRevision, cortex, revision, operation, payload }) {
  const previousEvents = await events(root);
  const latest = previousEvents.at(-1);
  if (latest?.revision === revision) {
    const expected = eventFor(previousEvents.slice(0, -1), { beforeRevision, cortex, revision, operation, payload });
    if (latest.id !== expected.id) throw new Error(`history already contains a different event for Cortex revision ${revision}`);
    return latest;
  }
  const event = eventFor(previousEvents, { beforeRevision, cortex, revision, operation, payload });
  if (previousEvents.length === 0) await writeSnapshot(root, beforeRevision, before);
  await fs.mkdir(path.dirname(eventsFile(root)), { recursive: true });
  await fs.appendFile(eventsFile(root), `${JSON.stringify(event)}\n`);
  if ((previousEvents.length + 1) % HISTORY_SNAPSHOT_INTERVAL === 0) await writeSnapshot(root, revision, cortex);
  return event;
}

export async function verifyHistory(root, { recover = true } = {}) {
  const recorded = await events(root); let previousEventId = null;
  for (const event of recorded) {
    const { id, ...core } = event;
    if (event.previous_event_id !== previousEventId || id !== digest(core)) throw new Error(`invalid history event ${id ?? 'unknown'}`);
    previousEventId = id;
  }
  const snapshots = await snapshotRevisions(root);
  if (recorded.length > 0 && snapshots.length === 0) throw new Error('history events exist without a recovery snapshot');
  const recovered = recover && recorded.length > 0 ? await recoverHistory(root, recorded, snapshots) : null;
  return { valid: true, events: recorded.length, snapshots: snapshots.length, revision: recovered?.revision ?? null };
}

export async function recoverHistory(root, recordedEvents = null, savedSnapshots = null) {
  const recorded = recordedEvents ?? await events(root); const snapshots = savedSnapshots ?? await snapshotRevisions(root);
  if (snapshots.length === 0) throw new Error('no history snapshots available for recovery');
  const snapshotPositions = new Map();
  snapshotPositions.set(recorded[0]?.previous_revision, -1);
  recorded.forEach((event, index) => snapshotPositions.set(event.revision, index));
  let position = -Infinity; let revision = null;
  for (const candidate of snapshots) {
    const candidatePosition = snapshotPositions.get(candidate);
    if (candidatePosition !== undefined && candidatePosition > position) { position = candidatePosition; revision = candidate; }
  }
  if (!revision) throw new Error('history snapshots do not match the event chain');
  let cortex = await readSnapshot(root, revision);
  for (const event of recorded.slice(position + 1)) {
    if (event.operation === 'apply') applyOperations(cortex, event.payload);
    else if (event.operation === 'replace') cortex = structuredClone(event.payload.cortex);
    else throw new Error(`unsupported history operation: ${event.operation}`);
    cortex.updated_at = event.updated_at; validateCortex(cortex);
    const actualRevision = cortexRevision(serializeCortex(cortex));
    if (actualRevision !== event.revision) throw new Error(`history recovery mismatch at event ${event.id}`);
    revision = actualRevision;
  }
  return { cortex, revision };
}
