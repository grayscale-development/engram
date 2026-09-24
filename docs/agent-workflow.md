# Agent workflow

1. Run `init`, then `doctor`. Confirm `.engram/cortex.json`, `.engram/skills/engram-workflow/SKILL.md`, `.engram/skills/cerebellum/SKILL.md`, and `.engram/runtime/bin/engram.js` exist before continuing. If bootstrap was interrupted, rerun `init`; it preserves an existing Cortex and reinstalls the skills and local runtime.
2. Read `.engram/skills/engram-workflow/SKILL.md`, then `.engram/skills/cerebellum/SKILL.md`.
3. Inspect the repository and form the first Cortex in an input JSON file.
4. Use the local runtime: `node .engram/runtime/bin/engram.js read --with-revision`, then form the first Cortex with `replace --expected-revision <revision>`.
5. After every meaningful change or discovered mismatch, read a fresh revision and update or remove the affected Cortex entry with `apply --expected-revision <revision>` or `replace --expected-revision <revision>`.
6. Use `--history` when an audit trail or recovery checkpoint is required; run `history` to verify it.
7. `init` maintains a bounded block in the repository's `AGENTS.md`. It silently runs `focus --query` with distinctive task terms at the start of every substantive task. Open only its capped `evidence_paths` first, and use its correctness gate before finalizing.
8. When focus returns a shadow observation and the host supports subagents, the active agent silently starts a separate Cortex reviewer. The reviewer follows `.engram/skills/cortex-reviewer/SKILL.md`, independently checks the opening evidence, and records one verdict before the active agent replies. Do not ask the user to run this; hosts without subagents leave the observation unscored.
9. After a verified investigation, upsert the durable boundary, state transition, test seam, or correction that would make a related future task faster. Add retrieval keywords; never save an unverified conclusion.
10. Run `validate` before finishing.

Each `focus` result includes a local shadow observation ID. When an independent reviewer can verify the focused queue against source, follow [shadow mode](shadow-mode.md) to record the verdict. Shadow promotion never removes the source-verification requirement.

Before each user-facing reply, the managed instructions run `shadow report --json` and append one compact calibration line with independently verified accuracy. It shows calibration progress, not task success, cost, latency, or total token savings.

Engram automatically records successful local CLI/MCP activity and focus sizing in `.engram/evidence.ndjson`; inspect the bounded summary with `node .engram/runtime/bin/engram.js evidence`. This is local activity evidence, not a task-outcome evaluation.

The agent owns the Cortex. Engram stores and validates it; it never performs codebase analysis.
