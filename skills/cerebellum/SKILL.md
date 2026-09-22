---
name: cerebellum
description: Create and maintain an agent-authored repository Cortex. Use after Engram initialization and whenever code, product behavior, workflows, or decisions change.
---

# Cerebellum

The Cortex is a small, explicit chart of durable repository knowledge. You maintain it. Engram does not scan, parse, rank, or infer facts from code.

## Form the first Cortex

1. Read `.engram/cortex.json` and this Cerebellum.
2. Inspect deliberately: begin with the README, agent instructions, package/configuration, entry points, tests, and a few representative product paths. Do not catalog every file.
3. Write a compact Cortex with a one-paragraph `summary` plus only the areas, workflows, decisions, and conventions another agent needs to start useful work.
4. Save it as JSON, run `npx --yes github:grayscale-development/engram read --with-revision`, and pass the returned revision to `npx --yes github:grayscale-development/engram replace --input cortex.json --expected-revision <revision>`.
5. Run `npx --yes github:grayscale-development/engram validate`.

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

## Maintain the Cortex

After making a code change, or when you notice the Cortex contradicts the repository, immediately update the affected chart entries. Use `apply` for a small change and `replace` for a redesigned Cortex. Remove obsolete entries; do not leave stale claims.

```json
{
  "operations": [
    { "op": "upsert", "collection": "workflows", "item": { "id": "tests", "label": "Tests", "summary": "Run npm test.", "evidence": ["package.json"] } },
    { "op": "delete", "collection": "decisions", "id": "old-decision" }
  ]
}
```

Run `npx --yes github:grayscale-development/engram read --with-revision`, then `npx --yes github:grayscale-development/engram apply --input patch.json --expected-revision <revision>`, followed by `validate`. Add `--history` when this update needs an audit record.

Keep the Cortex concise, evidence-backed, and limited to durable information. Never add source copies, secrets, transient debugging notes, or guesses.
