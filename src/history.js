import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HISTORY_PATH, HISTORY_SNAPSHOT_INTERVAL } from './constants.js';
import { applyOperations } from './semantic.js';
import { cortexRevision, serializeCortex, validateCortex } from './storage.js';

const eventsFile = (root) => path.join(root, HISTORY_PATH, 'events.ndjson');
const snapshotsDirectory = (root) => path.join(root, HISTORY_PATH, 'snapshots');
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

export async function appendHistory(root, { before, beforeRevision, cortex, revision, operation, payload }) {
  const previousEvents = await events(root);
  if (previousEvents.length === 0) await writeSnapshot(root, beforeRevision, before);
  const core = {
    format_version: 1,
    previous_event_id: previousEvents.at(-1)?.id ?? null,
    previous_revision: beforeRevision,
    revision,
    operation,
    payload,
    updated_at: cortex.updated_at
  };
  const event = { ...core, id: digest(core) };
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
