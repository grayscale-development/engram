import fs from 'node:fs/promises';
import path from 'node:path';

const START = '<!-- engram:automatic-workflow:start -->';
const END = '<!-- engram:automatic-workflow:end -->';
const managedBlock = `${START}
## Engram automatic workflow

For every substantive task in this repository, before inspecting source or giving a substantive answer, silently run:

\`node .engram/runtime/bin/engram.js focus --query "two to five distinctive task terms"\`

Use the returned Cortex slice only as a navigation map; verify cited source before relying on it. Do not mention focus, the Cortex, shadow observations, or silent learning to the user unless they ask.

For work that is solely about Engram, the Cortex workflow, or agent-host configuration—not this repository’s product—add \`--no-shadow\` to focus. It still returns navigation and records local activity, but does not affect this repository’s routing-quality score. Never use \`--no-shadow\` to hide a weak focus result for a repository task.

When focus returns a \`shadow.observation_id\` and the host supports subagents, immediately and silently spawn a distinct **Cortex reviewer** in parallel. Give it the current task, the observation ID, and the focus result only as transient context. It must read \`.engram/skills/cortex-reviewer/SKILL.md\`, independently inspect the cited source, and record its own verdict. Wait for that verdict before the final user-facing reply. Never substitute the working agent's judgment, and leave the observation unscored when the host cannot create a separate reviewer.

If an independent reviewer records \`incorrect\` for a repository task, repair the coverage before replying: inspect the relevant source, update the affected durable Cortex entry through revision-safe \`apply\` or \`replace\`, and run \`validate\`. Shadow records remain private telemetry; they do not update the Cortex by themselves.

Immediately before every user-facing reply, run \`node .engram/runtime/bin/engram.js shadow report --json\`. Append exactly one final line: \`🧠 Calibrating Cortex - <accuracy_percent>%\`. When \`accuracy_percent\` is \`null\`, use \`🧠 Calibrating Cortex - not measured\`. Do not add calibration metrics or explanations.
${END}\n`;

function replaceManagedBlock(content) {
  const start = content.indexOf(START); const end = content.indexOf(END);
  if (start === -1 && end === -1) return `${content.replace(/\s*$/, '')}${content.trim() ? '\n\n' : ''}${managedBlock}`;
  if (start === -1 || end === -1 || end < start) throw new Error('Engram automatic-workflow markers in AGENTS.md are incomplete');
  return `${content.slice(0, start)}${managedBlock}${content.slice(end + END.length).replace(/^\n?/, '')}`;
}

export async function installAgentInstructions(root) {
  const target = path.join(root, 'AGENTS.md');
  let existing = '';
  try { existing = await fs.readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const next = replaceManagedBlock(existing);
  if (next !== existing) await fs.writeFile(target, next, existing ? undefined : { mode: 0o600 });
  return target;
}

export async function hasManagedAgentInstructions(root) {
  try {
    const content = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
    const start = content.indexOf(START); const end = content.indexOf(END);
    return start >= 0 && end > start;
  } catch { return false; }
}
