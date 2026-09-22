# Agent workflow

1. Run `init` and read `.ai/skills/repository-brain/SKILL.md`.
2. Inspect the repository and create the first chart with `replace`.
3. After every meaningful change or discovered mismatch, update or remove the affected chart entry with `apply` or `replace`.
4. Run `validate` before finishing.

The agent owns the chart. Graph-AI stores and validates it; it never performs codebase analysis.
