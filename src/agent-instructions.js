import fs from 'node:fs/promises';
import path from 'node:path';

const START = '<!-- engram:automatic-workflow:start -->';
const END = '<!-- engram:automatic-workflow:end -->';
const managedBlock = `${START}
## Engram automatic workflow

For every substantive task in this repository, before inspecting source or giving a substantive answer, silently run:

\`node .engram/runtime/bin/engram.js focus --query "two to five distinctive task terms"\`

Use the returned Cortex slice only as a navigation map; verify cited source before relying on it. Do not mention focus, the Cortex, shadow observations, or silent learning to the user unless they ask.

When focus returns a \`shadow.observation_id\` and the host supports subagents, immediately and silently spawn a distinct **Cortex reviewer** in parallel. Give it the current task, the observation ID, and the focus result only as transient context. It must read \`.engram/skills/cortex-reviewer/SKILL.md\`, independently inspect the cited source, and record its own verdict. Wait for that verdict before the final user-facing reply. Never substitute the working agent's judgment, and leave the observation unscored when the host cannot create a separate reviewer.

Immediately before every user-facing reply, run \`node .engram/runtime/bin/engram.js shadow report --json\`. Append this compact three-line calibration footer, substituting values from the report:

\`🧠 Cortex calibration  <lifecycle>\`
\`Progress to assisted focus  [<ten-cell bar>] <scored_reviews>/<minimum_independent_reviews> independent reviews\`
\`<accuracy text> · target <target_accuracy_percent>% · <milestone text>\`

Render \`<lifecycle>\` as \`○ Observing  →  ○ Calibrating  →  ○ Improving  →  ○ Assisted\`, replacing only the active stage's \`○\` with \`●\`. The active stage is the report phase; map \`ready-to-promote\` to Assisted. Keep inactive stages hollow, including completed stages, so the active light clearly marks the current step. Use \`█\` for filled cells and \`░\` for empty cells; fill \`round(10 × min(scored_reviews / minimum_independent_reviews, 1))\` cells. Use \`<accuracy_percent>% independently verified\` as accuracy text, or \`Accuracy measuring after the first review\` when \`accuracy_percent\` is \`null\`. For milestone text: say \`first review pending\` while observing, \`<remaining> reviews to go\` while calibrating, \`review target met; improve accuracy\` while improving, \`ready to enable assisted focus\` while ready-to-promote, \`assisted focus enabled\` when assisted, and \`shadow learning disabled\` when disabled. Do not add raw shadow metrics or explanations.
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
