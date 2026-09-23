import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SHADOW_CONFIG_PATH, SHADOW_EVENTS_PATH, SHADOW_LOCK_PATH } from './constants.js';

const EVENT_VERSION = 1;
const MAX_EVENTS = 2_000;
const MAX_BYTES = 1024 * 1024;
const DEFAULT_SETTINGS = Object.freeze({ version: 1, enabled: true, activation: 'shadow', target_accuracy_percent: 95, minimum_independent_reviews: 20, promoted_at: null });
const now = () => new Date().toISOString();
const configFile = (root) => path.join(root, SHADOW_CONFIG_PATH);
const eventsFile = (root) => path.join(root, SHADOW_EVENTS_PATH);

function validSettings(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && value.version === 1 && typeof value.enabled === 'boolean'
    && ['shadow', 'assisted'].includes(value.activation)
    && Number.isInteger(value.target_accuracy_percent) && value.target_accuracy_percent >= 50 && value.target_accuracy_percent <= 100
    && Number.isInteger(value.minimum_independent_reviews) && value.minimum_independent_reviews >= 1 && value.minimum_independent_reviews <= 500
    && (value.promoted_at === null || (typeof value.promoted_at === 'string' && Number.isFinite(Date.parse(value.promoted_at))));
}
function validEvent(event) { return event && typeof event === 'object' && !Array.isArray(event) && event.version === EVENT_VERSION && typeof event.id === 'string' && typeof event.at === 'string' && Number.isFinite(Date.parse(event.at)) && ['observation', 'review'].includes(event.kind); }
function parseEvents(raw) { return raw.split('\n').flatMap((line) => { if (!line.trim()) return []; try { const event = JSON.parse(line); return validEvent(event) ? [event] : []; } catch { return []; } }); }
function isDomain(value) { return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value); }

async function readEvents(root) {
  try { return parseEvents(await fs.readFile(eventsFile(root), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function writeEvents(root, events) {
  const file = eventsFile(root); const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, { mode: 0o600 });
  await fs.rename(temporary, file);
}
async function lock(root) {
  const file = path.join(root, SHADOW_LOCK_PATH);
  try { return { file, handle: await fs.open(file, 'wx', 0o600) }; }
  catch (error) { if (error.code === 'EEXIST') throw new Error('shadow learning is busy; retry the command'); throw error; }
}
async function unlock(value) { await value.handle.close(); await fs.unlink(value.file).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }

export async function shadowSettings(root) {
  try {
    const settings = JSON.parse(await fs.readFile(configFile(root), 'utf8'));
    if (!validSettings(settings)) throw new Error('invalid shadow settings');
    return settings;
  } catch (error) { if (error.code === 'ENOENT') return DEFAULT_SETTINGS; throw error; }
}
export async function ensureShadowSettings(root) {
  const file = configFile(root);
  try { await fs.access(file); return await shadowSettings(root); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.writeFile(file, `${JSON.stringify(DEFAULT_SETTINGS, null, 2)}\n`, { mode: 0o600 });
  return DEFAULT_SETTINGS;
}

function metrics(settings, events) {
  const observations = events.filter((event) => event.kind === 'observation');
  const reviews = events.filter((event) => event.kind === 'review');
  const independent = reviews.filter((event) => event.reviewer === 'independent');
  const scored = independent.filter((event) => ['correct', 'incorrect'].includes(event.verdict));
  const correct = scored.filter((event) => event.verdict === 'correct').length;
  const accuracy = scored.length ? Number(((correct / scored.length) * 100).toFixed(1)) : null;
  const byDomain = new Map();
  for (const review of independent) {
    const item = byDomain.get(review.domain) ?? { domain: review.domain, observations: 0, independent_reviews: 0, scored_reviews: 0, correct: 0, incorrect: 0, inconclusive: 0 };
    item.observations++; item.independent_reviews++;
    if (review.verdict === 'correct') { item.scored_reviews++; item.correct++; }
    else if (review.verdict === 'incorrect') { item.scored_reviews++; item.incorrect++; }
    else item.inconclusive++;
    byDomain.set(review.domain, item);
  }
  const domains = [...byDomain.values()].map((item) => ({ ...item, accuracy_percent: item.scored_reviews ? Number(((item.correct / item.scored_reviews) * 100).toFixed(1)) : null, phase: item.scored_reviews >= settings.minimum_independent_reviews && (item.correct / item.scored_reviews) * 100 >= settings.target_accuracy_percent ? 'eligible' : 'shadow' })).sort((left, right) => left.domain.localeCompare(right.domain));
  const enough = scored.length >= settings.minimum_independent_reviews;
  const meets = enough && accuracy >= settings.target_accuracy_percent;
  return { observations: observations.length, reviews: reviews.length, independent_reviews: independent.length, scored_reviews: scored.length, correct_reviews: correct, accuracy_percent: accuracy, domains, eligible: meets };
}
function phase(settings, summary) {
  if (!settings.enabled) return 'disabled';
  if (summary.scored_reviews === 0) return 'observing';
  if (summary.scored_reviews < settings.minimum_independent_reviews) return 'calibrating';
  if (!summary.eligible) return 'improving';
  return settings.activation === 'assisted' ? 'assisted' : 'ready-to-promote';
}
function nextAction(settings, summary, currentPhase) {
  if (currentPhase === 'disabled') return 'Shadow learning is disabled in .engram/shadow.json.';
  if (currentPhase === 'observing') return 'Use focus during meaningful tasks; an independent reviewer must record a source-verified verdict before confidence can be calculated.';
  if (currentPhase === 'calibrating') return `${settings.minimum_independent_reviews - summary.scored_reviews} more independent scored review${settings.minimum_independent_reviews - summary.scored_reviews === 1 ? '' : 's'} are required before promotion can be considered.`;
  if (currentPhase === 'improving') return `Independent accuracy is ${summary.accuracy_percent}%; keep shadow mode until it reaches ${settings.target_accuracy_percent}%.`;
  if (currentPhase === 'ready-to-promote') return 'The threshold is met; record the next review or run shadow record to persist assisted mode.';
  return 'Assisted focus is enabled. Continue independent reviews; the Cortex automatically returns to shadow mode if confidence falls below the threshold.';
}

async function persistSettings(root, settings) { await fs.writeFile(configFile(root), `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 }); }
async function append(root, event) {
  const held = await lock(root);
  try {
    const events = await readEvents(root); events.push(event);
    if (events.length > MAX_EVENTS || Buffer.byteLength(events.map((item) => JSON.stringify(item)).join('\n'), 'utf8') > MAX_BYTES) await writeEvents(root, events.slice(-MAX_EVENTS));
    else await fs.appendFile(eventsFile(root), `${JSON.stringify(event)}\n`, { mode: 0o600 });
    return events;
  } finally { await unlock(held); }
}
async function syncActivation(root) {
  const [settings, events] = await Promise.all([shadowSettings(root), readEvents(root)]); const summary = metrics(settings, events);
  if (!settings.enabled) return { settings, summary, transitioned: false };
  const desired = summary.eligible ? 'assisted' : 'shadow';
  if (settings.activation !== desired) {
    const updated = { ...settings, activation: desired, promoted_at: desired === 'assisted' ? now() : null };
    await persistSettings(root, updated);
    return { settings: updated, summary, transitioned: true };
  }
  return { settings, summary, transitioned: false };
}

export async function recordShadowFocus(root, { source, focus }) {
  try {
    const settings = await shadowSettings(root); if (!settings.enabled) return null;
    const event = { version: EVENT_VERSION, id: randomUUID(), at: now(), kind: 'observation', source, matches: focus.matches.length, evidence_paths: focus.evidence_paths.length };
    await append(root, event);
    return event.id;
  } catch { return null; }
}
export async function recordShadowReview(root, review) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) throw new Error('shadow review must be a JSON object');
  if (typeof review.observation_id !== 'string' || !/^[a-f0-9-]{36}$/i.test(review.observation_id)) throw new Error('shadow review requires an observation_id returned by focus');
  if (!isDomain(review.domain)) throw new Error('shadow review domain must be lowercase letters, numbers, or hyphens (1-64 characters)');
  if (!['independent', 'self'].includes(review.reviewer)) throw new Error('shadow review reviewer must be independent or self');
  if (!['correct', 'incorrect', 'inconclusive'].includes(review.verdict)) throw new Error('shadow review verdict must be correct, incorrect, or inconclusive');
  const settings = await shadowSettings(root); if (!settings.enabled) throw new Error('shadow learning is disabled in .engram/shadow.json');
  const held = await lock(root);
  try {
    const events = await readEvents(root);
    if (!events.some((event) => event.kind === 'observation' && event.id === review.observation_id)) throw new Error('shadow observation was not found');
    if (events.some((event) => event.kind === 'review' && event.observation_id === review.observation_id)) throw new Error('shadow observation already has a review');
    const event = { version: EVENT_VERSION, id: randomUUID(), at: now(), kind: 'review', observation_id: review.observation_id, domain: review.domain, reviewer: review.reviewer, verdict: review.verdict };
    events.push(event);
    if (events.length > MAX_EVENTS || Buffer.byteLength(events.map((item) => JSON.stringify(item)).join('\n'), 'utf8') > MAX_BYTES) await writeEvents(root, events.slice(-MAX_EVENTS));
    else await fs.appendFile(eventsFile(root), `${JSON.stringify(event)}\n`, { mode: 0o600 });
  } finally { await unlock(held); }
  return shadowStatus(root, { sync: true });
}
export async function shadowStatus(root, { sync = false } = {}) {
  const value = sync ? await syncActivation(root) : { settings: await shadowSettings(root), summary: null };
  const settings = value.settings; const summary = value.summary ?? metrics(settings, await readEvents(root)); const currentPhase = phase(settings, summary);
  return { status: settings.enabled ? 'available' : 'disabled', activation: settings.activation, phase: currentPhase, target_accuracy_percent: settings.target_accuracy_percent, minimum_independent_reviews: settings.minimum_independent_reviews, ...summary, next: nextAction(settings, summary, currentPhase) };
}
export function shadowReport(status) {
  const accuracy = status.accuracy_percent === null ? 'Not measured' : `${status.accuracy_percent}%`;
  const lines = ['CORTEX SHADOW MODE', `Phase: ${status.phase}`, `Activation: ${status.activation}`, `Independent scored reviews: ${status.scored_reviews}/${status.minimum_independent_reviews}`, `Independent accuracy: ${accuracy} (target: ${status.target_accuracy_percent}%)`, `Focus observations: ${status.observations}`, `Next: ${status.next}`];
  if (status.domains.length) { lines.push('', 'Domains:'); for (const domain of status.domains) lines.push(`- ${domain.domain}: ${domain.accuracy_percent === null ? 'not measured' : `${domain.accuracy_percent}%`} across ${domain.scored_reviews} scored independent review${domain.scored_reviews === 1 ? '' : 's'} (${domain.phase})`); }
  return lines.join('\n');
}
export async function shadowGuidance(root, observationId = null) {
  try {
    const status = await shadowStatus(root);
    return { observation_id: observationId, phase: status.phase, activation: status.activation, review_required: status.phase !== 'disabled' && status.activation !== 'assisted', note: status.phase === 'disabled' ? 'Shadow learning is disabled; focus still requires source verification.' : status.activation === 'assisted' ? 'Cortex focus is calibrated for assisted use; verify cited source before relying on it.' : 'Cortex focus remains in shadow calibration; verify cited source and submit an independent review after the task.' };
  } catch { return { observation_id: observationId, phase: 'unavailable', activation: 'shadow', review_required: false, note: 'Shadow learning is unavailable; focus still requires source verification.' }; }
}
