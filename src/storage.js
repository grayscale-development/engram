import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { CORTEX_LOCK_PATH, CORTEX_PATH, FORMAT_VERSION, MAX_CORTEX_BYTES, MAX_CORTEX_ENTRIES, MAX_EVIDENCE_LENGTH, MAX_EVIDENCE_PER_ENTRY, MAX_ID_LENGTH, MAX_KEYWORD_LENGTH, MAX_KEYWORDS_PER_ENTRY, MAX_LABEL_LENGTH, MAX_SUMMARY_LENGTH } from './constants.js';

export class CortexBusyError extends Error {
  constructor() { super('another Cortex mutation is in progress; read the latest snapshot and retry'); this.code = 'CORTEX_BUSY'; }
}

export class CortexRevisionConflictError extends Error {
  constructor(expectedRevision, current) {
    super(`Cortex revision conflict: expected ${expectedRevision}, current ${current.revision}`);
    this.code = 'REVISION_CONFLICT'; this.expectedRevision = expectedRevision; this.current = current;
  }
}

export class CortexExpectedRevisionError extends Error {
  constructor() { super('expected_revision is required for mutations; read a snapshot first'); this.code = 'EXPECTED_REVISION_REQUIRED'; }
}

function limitedString(value, name, maximum) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  if (value.length > maximum) throw new Error(`${name} exceeds the ${maximum}-character AI context limit`);
}

export function serializeCortex(cortex) { return `${JSON.stringify(cortex)}\n`; }
export function cortexRevision(serialized) { return createHash('sha256').update(serialized).digest('hex'); }

export function emptyCortex(root) {
  return { format_version: FORMAT_VERSION, repository: { name: path.basename(root), root: '.' }, chart: { summary: '', areas: [], workflows: [], decisions: [], conventions: [] }, updated_at: new Date().toISOString() };
}
export function validateCortex(cortex) {
  if (!cortex || typeof cortex !== 'object' || Array.isArray(cortex)) throw new Error('cortex must be a JSON object');
  if (cortex.format_version !== undefined && cortex.format_version !== FORMAT_VERSION) throw new Error(`unsupported cortex format: ${cortex.format_version}`);
  if (!cortex.repository || typeof cortex.repository !== 'object') throw new Error('cortex.repository must be an object');
  if (!cortex.chart || typeof cortex.chart !== 'object') throw new Error('cortex.chart must be an object');
  limitedString(cortex.repository.name, 'cortex.repository.name', MAX_LABEL_LENGTH);
  if (typeof cortex.chart.summary !== 'string') throw new Error('cortex.chart.summary must be a string');
  if (cortex.chart.summary.length > MAX_SUMMARY_LENGTH) throw new Error(`cortex.chart.summary exceeds the ${MAX_SUMMARY_LENGTH}-character AI context limit`);
  let entryCount = 0;
  for (const collection of ['areas', 'workflows', 'decisions', 'conventions']) {
    if (!Array.isArray(cortex.chart[collection])) throw new Error(`cortex.chart.${collection} must be an array`);
    const ids = new Set();
    for (const item of cortex.chart[collection]) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`cortex.chart.${collection} entries must be objects`);
      entryCount++;
      limitedString(item.id, `cortex.chart.${collection}.id`, MAX_ID_LENGTH);
      if (ids.has(item.id)) throw new Error(`cortex.chart.${collection} has duplicate id: ${item.id}`); ids.add(item.id);
      limitedString(item.label, `cortex.chart.${collection}.${item.id}.label`, MAX_LABEL_LENGTH);
      limitedString(item.summary, `cortex.chart.${collection}.${item.id}.summary`, MAX_SUMMARY_LENGTH);
      if (item.evidence !== undefined && (!Array.isArray(item.evidence) || item.evidence.some((value) => typeof value !== 'string'))) throw new Error(`cortex.chart.${collection}.${item.id}.evidence must be an array of strings`);
      if (item.evidence?.length > MAX_EVIDENCE_PER_ENTRY) throw new Error(`cortex.chart.${collection}.${item.id}.evidence exceeds ${MAX_EVIDENCE_PER_ENTRY} paths`);
      if (item.evidence?.some((value) => value.length > MAX_EVIDENCE_LENGTH)) throw new Error(`cortex.chart.${collection}.${item.id}.evidence path exceeds ${MAX_EVIDENCE_LENGTH} characters`);
      if (item.keywords !== undefined && (!Array.isArray(item.keywords) || item.keywords.some((value) => typeof value !== 'string' || !value.trim()))) throw new Error(`cortex.chart.${collection}.${item.id}.keywords must be an array of non-empty strings`);
      if (item.keywords?.length > MAX_KEYWORDS_PER_ENTRY) throw new Error(`cortex.chart.${collection}.${item.id}.keywords exceeds ${MAX_KEYWORDS_PER_ENTRY} entries`);
      if (item.keywords?.some((value) => value.length > MAX_KEYWORD_LENGTH)) throw new Error(`cortex.chart.${collection}.${item.id}.keyword exceeds ${MAX_KEYWORD_LENGTH} characters`);
      if (item.keywords && new Set(item.keywords.map((value) => value.toLowerCase())).size !== item.keywords.length) throw new Error(`cortex.chart.${collection}.${item.id}.keywords has duplicates`);
    }
  }
  if (entryCount > MAX_CORTEX_ENTRIES) throw new Error(`cortex exceeds the ${MAX_CORTEX_ENTRIES}-entry AI working-set limit`);
  if (Buffer.byteLength(serializeCortex(cortex)) > MAX_CORTEX_BYTES) throw new Error(`cortex exceeds the ${MAX_CORTEX_BYTES}-byte AI working-set limit`);
  return cortex;
}
export async function loadCortex(root) {
  return (await loadCortexWithRevision(root))?.cortex ?? null;
}
export async function loadCortexWithRevision(root) {
  const file = path.join(root, CORTEX_PATH);
  try { const serialized = await fs.readFile(file, 'utf8'); return { cortex: validateCortex(JSON.parse(serialized)), revision: cortexRevision(serialized) }; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function saveCortex(root, cortex) {
  validateCortex(cortex); cortex.format_version = FORMAT_VERSION; cortex.updated_at = new Date().toISOString();
  const serialized = serializeCortex(cortex); const file = path.join(root, CORTEX_PATH); const temporary = `${file}.${process.pid}.tmp`; await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(temporary, serialized); await fs.rename(temporary, file);
  return { cortex, revision: cortexRevision(serialized) };
}

function lockMetadata() {
  return { version: 1, pid: process.pid, created_at: new Date().toISOString() };
}

function parseLockMetadata(serialized) {
  let metadata;
  try { metadata = JSON.parse(serialized); }
  catch { return null; }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  if (metadata.version !== 1 || !Number.isSafeInteger(metadata.pid) || metadata.pid < 1 || typeof metadata.created_at !== 'string' || !Number.isFinite(Date.parse(metadata.created_at))) return null;
  return metadata;
}

function processIsAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    // EPERM means the process exists but is not signalable. Treat all unknown
    // errors as active too: availability is never worth deleting a live lock.
    return error.code !== 'ESRCH';
  }
}

async function recoverStaleLock(lock) {
  let metadata;
  try { metadata = parseLockMetadata(await fs.readFile(lock, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  if (!metadata || processIsAlive(metadata.pid)) return false;

  // Rename is atomic. Once this succeeds, later acquirers create a new lock at
  // `lock`; cleanup only touches the renamed stale file, never that new lock.
  const recovered = `${lock}.stale-${process.pid}-${randomUUID()}`;
  try { await fs.rename(lock, recovered); }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  await fs.unlink(recovered).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  return true;
}

async function acquireCortexLock(lock) {
  for (;;) {
    try {
      const handle = await fs.open(lock, 'wx');
      try { await handle.writeFile(`${JSON.stringify(lockMetadata())}\n`); }
      catch (error) { await handle.close(); await fs.unlink(lock).catch(() => {}); throw error; }
      return handle;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!await recoverStaleLock(lock)) throw new CortexBusyError();
    }
  }
}

async function removeOwnedLock(lock, handle) {
  const owner = await handle.stat();
  await handle.close();
  try {
    const current = await fs.stat(lock);
    if (current.dev === owner.dev && current.ino === owner.ino) await fs.unlink(lock);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function withCortexLock(root, operation) {
  const lock = path.join(root, CORTEX_LOCK_PATH); let handle;
  await fs.mkdir(path.dirname(lock), { recursive: true });
  handle = await acquireCortexLock(lock);
  try { return await operation(); }
  finally { await removeOwnedLock(lock, handle); }
}
