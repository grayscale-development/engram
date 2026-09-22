import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_IGNORES, SENSITIVE_NAMES, TEXT_EXTENSIONS, LANGUAGE_BY_EXTENSION } from './constants.js';
import { rel, sha256 } from './utils.js';

async function ignoredByGit(root, relative) {
  try {
    const { execFile } = await import('node:child_process');
    return await new Promise((resolve) => execFile('git', ['check-ignore', '-q', '--', relative], { cwd: root }, (error) => resolve(!error)));
  } catch { return false; }
}
export async function scan(root) {
  const found = [];
  // Git itself is the authority when available. This small fallback keeps common
  // repositories safe even before `git init` (for fixtures, exports, and zips).
  const ignoreRules = (await fs.readFile(path.join(root, '.gitignore'), 'utf8').catch(() => '')).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && !line.startsWith('!'));
  const locallyIgnored = (relative) => ignoreRules.some((rule) => {
    const normalized = rule.replace(/^\//, '').replace(/\*\*/g, '');
    if (normalized.endsWith('/')) return relative.startsWith(normalized.slice(0, -1));
    if (normalized.includes('*')) { const pattern = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'); return new RegExp(`^${pattern}$`).test(relative); }
    return relative === normalized || relative.startsWith(`${normalized}/`);
  });
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name); const relative = rel(root, full);
      if (DEFAULT_IGNORES.has(entry.name) || SENSITIVE_NAMES.test(relative) || locallyIgnored(relative)) continue;
      if (await ignoredByGit(root, relative)) continue;
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const stat = await fs.stat(full);
        if (TEXT_EXTENSIONS.has(ext) || !ext) {
          const content = await fs.readFile(full, 'utf8').catch(() => null);
          if (content !== null && !content.includes('\0')) found.push({ path: relative, content, hash: sha256(content), size: stat.size, language: LANGUAGE_BY_EXTENSION[ext] || 'Text' });
        }
      }
    }
  }
  await walk(root);
  return found;
}
