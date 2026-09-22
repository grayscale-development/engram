import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

export function result(checks) { return { passed: checks.every((check) => check.pass), checks }; }
export function check(name, pass, detail = '') { return { name, pass, detail }; }
export async function readResult(root) { return JSON.parse(await fs.readFile(`${root}/RESULT.json`, 'utf8')); }
export async function line(root, file, number) {
  const lines = (await fs.readFile(`${root}/${file}`, 'utf8')).split('\n'); return lines[number - 1] ?? '';
}
export function command(executable, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
export async function emit(judge) { process.stdout.write(`${JSON.stringify(judge)}\n`); process.exitCode = judge.passed ? 0 : 1; }
