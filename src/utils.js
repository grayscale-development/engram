import crypto from 'node:crypto';
import path from 'node:path';

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const tokenEstimate = (value = '') => Math.ceil(String(value).length / 4);
export const slug = (value) => String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'untitled';
export const rel = (root, file) => path.relative(root, file).split(path.sep).join('/');
export const unique = (values) => [...new Set(values.filter(Boolean))];
export function terms(value) {
  return unique(String(value || '').toLowerCase().replace(/([a-z])([A-Z])/g, '$1 $2').match(/[a-z][a-z0-9_-]{1,}/g) || []);
}
export async function git(root, args) {
  try {
    const { execFileSync } = await import('node:child_process');
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
}
