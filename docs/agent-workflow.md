# Agent workflow

1. Run `init`, then `doctor`. Confirm `.engram/cortex.json`, `.engram/skills/engram-workflow/SKILL.md`, `.engram/skills/cerebellum/SKILL.md`, and `.engram/runtime/bin/engram.js` exist before continuing. If bootstrap was interrupted, rerun `init`; it preserves an existing Cortex and reinstalls the skills and local runtime.
2. Read `.engram/skills/engram-workflow/SKILL.md`, then `.engram/skills/cerebellum/SKILL.md`.
3. Inspect the repository and form the first Cortex in an input JSON file.
4. Use the local runtime: `node .engram/runtime/bin/engram.js read --with-revision`, then form the first Cortex with `replace --expected-revision <revision>`.
5. After every meaningful change or discovered mismatch, read a fresh revision and update or remove the affected Cortex entry with `apply --expected-revision <revision>` or `replace --expected-revision <revision>`.
6. Use `--history` when an audit trail or recovery checkpoint is required; run `history` to verify it.
7. At the start of a task, use `focus --query` with distinctive task terms. Open only its capped `evidence_paths` first, and use its correctness gate before finalizing.
8. After a verified investigation, upsert the durable boundary, state transition, test seam, or correction that would make a related future task faster. Add retrieval keywords; never save an unverified conclusion.
9. Run `validate` before finishing.

Engram automatically records successful local CLI/MCP activity and focus sizing in `.engram/evidence.ndjson`; inspect the bounded summary with `node .engram/runtime/bin/engram.js evidence`. This is local activity evidence, not a task-outcome evaluation.

The agent owns the Cortex. Engram stores and validates it; it never performs codebase analysis.
