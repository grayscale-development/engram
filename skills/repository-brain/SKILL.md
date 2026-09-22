---
name: repository-brain
description: Create and maintain an agent-authored repository brain. Use after Graph-AI initialization and whenever code, product behavior, workflows, or decisions change.
---

# Repository brain

The brain is a small, explicit chart of durable repository knowledge. You maintain it. Graph-AI does not scan, parse, rank, or infer facts from code.

## First chart

1. Read `.ai/brain.json` and this skill.
2. Inspect the repository deliberately: start with the README, agent instructions, package/configuration, entry points, tests, and a few representative product paths. Do not catalog every file.
3. Write a compact chart with a one-paragraph `summary` plus only the areas, workflows, decisions, and conventions another agent needs to start useful work.
4. Save it as JSON and run `npx --yes github:grayscale-development/graph-ai replace --input brain.json`.
5. Run `npx --yes github:grayscale-development/graph-ai validate`.

Use this shape:

```json
{
  "repository": { "name": "repo", "root": "." },
  "chart": {
    "summary": "What this repository is and how it is organized.",
    "areas": [{ "id": "checkout", "label": "Checkout", "summary": "...", "evidence": ["src/checkout.js"] }],
    "workflows": [{ "id": "tests", "label": "Tests", "summary": "...", "evidence": ["package.json"] }],
    "decisions": [],
    "conventions": []
  }
}
```

## Keep it current

After making a code change, or when you notice the brain contradicts the repository, immediately update the affected chart entries. Use `apply` for a small change and `replace` for a redesigned chart. Remove obsolete entries; do not leave stale claims.

```json
{
  "operations": [
    { "op": "upsert", "collection": "workflows", "item": { "id": "tests", "label": "Tests", "summary": "Run npm test.", "evidence": ["package.json"] } },
    { "op": "delete", "collection": "decisions", "id": "old-decision" }
  ]
}
```

Run `npx --yes github:grayscale-development/graph-ai apply --input patch.json`, then `validate`.

Keep the chart concise, evidence-backed, and limited to durable information. Never add source copies, secrets, transient debugging notes, or guesses.
