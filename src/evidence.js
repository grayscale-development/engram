import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EVIDENCE_CONFIG_PATH, EVIDENCE_LOCK_PATH, EVIDENCE_PATH } from './constants.js';
import { serializeCortex } from './storage.js';

const MAX_EVIDENCE_BYTES = 1024 * 1024;
const MAX_EVIDENCE_EVENTS = 2_000;
const EVENT_VERSION = 1;
const DEFAULT_EVIDENCE_SETTINGS = Object.freeze({ version: 1, enabled: true, retention: { max_events: MAX_EVIDENCE_EVENTS, max_bytes: MAX_EVIDENCE_BYTES } });

function estimatedTokens(value) { return Math.ceil(Buffer.byteLength(value, 'utf8') / 4); }
function now() { return new Date().toISOString(); }
function duration(startedAt) { return Math.max(0, Date.now() - startedAt); }
function cortexEntryCount(cortex) {
  return ['areas', 'workflows', 'decisions', 'conventions'].reduce((total, collection) => total + (Array.isArray(cortex?.chart?.[collection]) ? cortex.chart[collection].length : 0), 0);
}

function validEvidenceSettings(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && value.version === 1
    && typeof value.enabled === 'boolean'
    && value.retention && typeof value.retention === 'object' && !Array.isArray(value.retention)
    && Number.isInteger(value.retention.max_events) && value.retention.max_events >= 1 && value.retention.max_events <= MAX_EVIDENCE_EVENTS
    && Number.isInteger(value.retention.max_bytes) && value.retention.max_bytes >= 1024 && value.retention.max_bytes <= MAX_EVIDENCE_BYTES;
}

export async function evidenceSettings(root) {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(root, EVIDENCE_CONFIG_PATH), 'utf8'));
    if (!validEvidenceSettings(parsed)) throw new Error('invalid evidence settings');
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return DEFAULT_EVIDENCE_SETTINGS;
    throw error;
  }
}

export async function ensureEvidenceSettings(root) {
  const file = path.join(root, EVIDENCE_CONFIG_PATH);
  try { await fs.access(file); return await evidenceSettings(root); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.writeFile(file, `${JSON.stringify(DEFAULT_EVIDENCE_SETTINGS, null, 2)}\n`, { mode: 0o600 });
  return DEFAULT_EVIDENCE_SETTINGS;
}

function lockMetadata() { return { version: 1, pid: process.pid, created_at: now() }; }
function parseLockMetadata(serialized) {
  try {
    const value = JSON.parse(serialized);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.version !== 1 || !Number.isSafeInteger(value.pid) || value.pid < 1 || typeof value.created_at !== 'string' || !Number.isFinite(Date.parse(value.created_at))) return null;
    return value;
  } catch { return null; }
}
function processIsAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}
async function recoverStaleLock(lock) {
  let metadata;
  try { metadata = parseLockMetadata(await fs.readFile(lock, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  if (!metadata || processIsAlive(metadata.pid)) return false;
  const recovered = `${lock}.stale-${process.pid}-${randomUUID()}`;
  try { await fs.rename(lock, recovered); }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  await fs.unlink(recovered).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  return true;
}
async function acquireLock(lock) {
  for (;;) {
    try {
      const handle = await fs.open(lock, 'wx', 0o600);
      try { await handle.writeFile(`${JSON.stringify(lockMetadata())}\n`); }
      catch (error) { await handle.close(); await fs.unlink(lock).catch(() => {}); throw error; }
      return handle;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!await recoverStaleLock(lock)) return null;
    }
  }
}
async function releaseLock(lock, handle) {
  const owner = await handle.stat();
  await handle.close();
  try {
    const current = await fs.stat(lock);
    if (current.dev === owner.dev && current.ino === owner.ino) await fs.unlink(lock);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function validEvent(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && value.version === EVENT_VERSION && typeof value.at === 'string' && Number.isFinite(Date.parse(value.at)) && typeof value.kind === 'string' && typeof value.source === 'string';
}
function parseEvents(serialized) {
  return serialized.split('\n').flatMap((line) => {
    if (!line.trim()) return [];
    try { const event = JSON.parse(line); return validEvent(event) ? [event] : []; }
    catch { return []; }
  });
}
async function readEvents(root) {
  try { return parseEvents(await fs.readFile(path.join(root, EVIDENCE_PATH), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function writeEvents(file, events) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, { mode: 0o600 });
  await fs.rename(temporary, file);
}

async function appendEvent(root, event) {
  const directory = path.join(root, '.engram');
  try { await fs.access(directory); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  const settings = await evidenceSettings(root);
  if (!settings.enabled) return false;
  const lock = path.join(root, EVIDENCE_LOCK_PATH);
  const handle = await acquireLock(lock);
  if (!handle) return false;
  try {
    const file = path.join(root, EVIDENCE_PATH);
    const events = await readEvents(root);
    events.push(event);
    if (events.length > settings.retention.max_events || Buffer.byteLength(events.map((item) => JSON.stringify(item)).join('\n'), 'utf8') > settings.retention.max_bytes) {
      await writeEvents(file, events.slice(-settings.retention.max_events));
    } else {
      await fs.appendFile(file, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    }
    return true;
  } finally { await releaseLock(lock, handle); }
}

// Evidence is supplemental: an unavailable telemetry file must not make an
// otherwise safe Cortex read or mutation fail.
export async function recordEvidence(root, event) {
  try { return await appendEvent(root, event); }
  catch { return false; }
}

export async function recordOperationEvidence(root, { operation, source, startedAt, outcome = 'success', detail = null }) {
  return recordEvidence(root, {
    version: EVENT_VERSION,
    at: now(),
    kind: operation === 'init' ? 'setup' : 'operation',
    operation,
    source,
    outcome,
    duration_ms: duration(startedAt),
    ...(detail && typeof detail === 'object' ? { detail } : {})
  });
}

export function cortexEvidenceDetail(cortex) { return { cortex_entries: cortexEntryCount(cortex) }; }

export function focusMeasurement(snapshot, focus) {
  const full = serializeCortex(snapshot.cortex);
  const focused = JSON.stringify({ summary: focus.summary, matches: focus.matches, evidence_paths: focus.evidence_paths });
  const fullCortexTokens = estimatedTokens(full);
  const focusTokens = estimatedTokens(focused);
  return {
    full_cortex_tokens: fullCortexTokens,
    focus_tokens: focusTokens,
    estimated_context_reduction: {
      label: 'Estimated Cortex-context reduction',
      method: 'UTF-8 characters divided by four; this is not measured total task token savings',
      tokens: Math.max(0, fullCortexTokens - focusTokens),
      percent: fullCortexTokens ? Math.max(0, Math.round((1 - (focusTokens / fullCortexTokens)) * 100)) : 0
    }
  };
}

export async function recordFocusEvidence(root, { source, startedAt, snapshot, focus }) {
  const measurement = focusMeasurement(snapshot, focus);
  await recordEvidence(root, {
    version: EVENT_VERSION,
    at: now(),
    kind: 'focus',
    operation: 'focus',
    source,
    outcome: 'success',
    duration_ms: duration(startedAt),
    revision: snapshot.revision,
    matches: focus.matches.length,
    evidence_paths: focus.evidence_paths.length,
    full_cortex_tokens: measurement.full_cortex_tokens,
    focus_tokens: measurement.focus_tokens,
    estimated_context_reduction_tokens: measurement.estimated_context_reduction.tokens,
    estimated_context_reduction_percent: measurement.estimated_context_reduction.percent
  });
  return measurement;
}

export async function exportAutomaticEvidence(root, output) {
  const [settings, events, summary] = await Promise.all([evidenceSettings(root), readEvents(root), automaticEvidenceSummary(root)]);
  const report = {
    schema_version: 1,
    exported_at: now(),
    scope: 'local Engram automatic evidence',
    privacy: { storage: 'local-only', enabled: settings.enabled, retention: settings.retention },
    summary,
    events
  };
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return { output, events: events.length };
}

export async function automaticEvidenceSummary(root) {
  try {
    const [settings, events] = await Promise.all([evidenceSettings(root), readEvents(root)]);
    const focuses = events.filter((event) => event.kind === 'focus');
    const operations = events.filter((event) => event.kind === 'operation');
    const setup = events.find((event) => event.kind === 'setup') ?? null;
    const firstCortex = setup?.detail?.cortex_created === true
      ? events.find((event) => ['apply', 'replace'].includes(event.operation) && Number.isInteger(event.detail?.cortex_entries) && event.detail.cortex_entries > 0) ?? null
      : null;
    const setupAt = setup ? Date.parse(setup.at) : null;
    const firstCortexAt = firstCortex ? Date.parse(firstCortex.at) : null;
    const sources = Object.fromEntries(['cli', 'mcp'].map((source) => [source, events.filter((event) => event.source === source).length]));
    const estimatedTokens = focuses.reduce((total, event) => total + (Number.isFinite(event.estimated_context_reduction_tokens) ? event.estimated_context_reduction_tokens : 0), 0);
    const averageReduction = focuses.length ? Math.round(focuses.reduce((total, event) => total + (Number.isFinite(event.estimated_context_reduction_percent) ? event.estimated_context_reduction_percent : 0), 0) / focuses.length) : null;
    return {
      status: events.length ? 'available' : 'not-recorded',
      events: events.length,
      focus_actions: focuses.length,
      operation_actions: operations.length,
      sources,
      estimated_context_reduction_tokens: estimatedTokens,
      average_context_reduction_percent: averageReduction,
      setup: setup ? { at: setup.at, duration_ms: setup.duration_ms, cortex_created: setup.detail?.cortex_created === true } : null,
      first_cortex: firstCortex ? { at: firstCortex.at, entries: firstCortex.detail.cortex_entries, elapsed_after_setup_ms: Number.isFinite(setupAt) && Number.isFinite(firstCortexAt) ? Math.max(0, firstCortexAt - setupAt) : null } : null,
      last_recorded_at: events.at(-1)?.at ?? null,
      privacy: { storage: 'local-only', enabled: settings.enabled, retention: settings.retention },
      note: 'Automatic evidence records local Engram activity and estimated Cortex-context reduction. It does not measure task success, total model tokens, cost, or latency.'
    };
  } catch {
    return { status: 'unavailable', events: 0, focus_actions: 0, operation_actions: 0, sources: { cli: 0, mcp: 0 }, estimated_context_reduction_tokens: 0, average_context_reduction_percent: null, setup: null, first_cortex: null, last_recorded_at: null, privacy: null, note: 'Automatic evidence is unavailable for this repository.' };
  }
}
