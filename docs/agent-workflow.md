# Agent workflow

1. Run `init` and read `.engram/skills/cerebellum/SKILL.md`.
2. Inspect the repository and form the first Cortex in an input JSON file.
3. Use the local runtime: `node .engram/runtime/bin/engram.js read --with-revision`, then form the first Cortex with `replace --expected-revision <revision>`.
4. After every meaningful change or discovered mismatch, read a fresh revision and update or remove the affected Cortex entry with `apply --expected-revision <revision>` or `replace --expected-revision <revision>`.
5. Use `--history` when an audit trail or recovery checkpoint is required; run `history` to verify it.
6. At the start of a task, use `focus --query` with distinctive task terms. It returns only matching Cortex entries; verify their evidence before relying on them.
7. Run `validate` before finishing.

The agent owns the Cortex. Engram stores and validates it; it never performs codebase analysis.
