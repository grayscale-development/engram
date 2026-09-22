# Agent workflow

1. Run `init` and read `.engram/skills/cerebellum/SKILL.md`.
2. Inspect the repository and form the first Cortex with `replace`.
3. After every meaningful change or discovered mismatch, update or remove the affected Cortex entry with `apply` or `replace`.
4. Run `validate` before finishing.

The agent owns the Cortex. Engram stores and validates it; it never performs codebase analysis.
