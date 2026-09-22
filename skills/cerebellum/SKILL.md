---
name: cerebellum
description: Create and maintain an agent-authored repository Cortex. Use after Engram initialization and whenever code, product behavior, workflows, or decisions change.
---

# Cerebellum

The Cortex is a small, explicit chart of durable repository knowledge. You maintain it. Engram does not scan, parse, or infer facts from code.

`engram init` installs a self-contained local runtime at `.engram/runtime/bin/engram.js`. For all Cortex work in this repository, use it with `node .engram/runtime/bin/engram.js`; do not repeatedly use `npx`, install packages, or rely on network/cache state.

The Cerebellum is for creating and maintaining a Cortex. It is not ordinary task context: a diagnosing or implementation agent should use `focus` first and open this file only when it needs to change the Cortex.

## Form the first Cortex

1. Read `.engram/cortex.json` and this Cerebellum.
2. Inspect deliberately: begin with the README, agent instructions, package/configuration, entry points, tests, and a few representative product paths. Do not catalog every file.
3. Write a compact Cortex with a one-paragraph `summary` plus only the areas, workflows, decisions, and conventions another agent needs to start useful work. Give each investigation-relevant entry 2–8 distinctive, agent-authored `keywords` (domain nouns, aliases, route verbs, risk names) so future task wording retrieves it reliably.
4. Save it as JSON, run `node .engram/runtime/bin/engram.js read --with-revision`, and pass the returned revision to `node .engram/runtime/bin/engram.js replace --input cortex.json --expected-revision <revision>`.
5. Run `node .engram/runtime/bin/engram.js validate`.

Select information for future work, not a tour of folders. Include externally exposed boundaries, authorization and persistence paths, high-risk state transitions, test seams, and direct evidence paths. Prefer a few useful navigation anchors over generic architecture prose.

Use this shape:

```json
{
  "repository": { "name": "repo", "root": "." },
  "chart": {
    "summary": "What this repository is and how it is organized.",
    "areas": [{ "id": "checkout", "label": "Checkout", "summary": "...", "keywords": ["cart", "payment", "charge"], "evidence": ["src/checkout.js"] }],
    "workflows": [{ "id": "tests", "label": "Tests", "summary": "...", "evidence": ["package.json"] }],
    "decisions": [],
    "conventions": []
  }
}
```

## Maintain the Cortex

After making a code change, finishing an investigation, or noticing the Cortex contradicts the repository, immediately update the affected chart entries. Use `apply` for a small change and `replace` for a redesigned Cortex. Remove obsolete entries; do not leave stale claims.

```json
{
  "operations": [
    { "op": "upsert", "collection": "workflows", "item": { "id": "tests", "label": "Tests", "summary": "Run npm test.", "evidence": ["package.json"] } },
    { "op": "delete", "collection": "decisions", "id": "old-decision" }
  ]
}
```

Run `node .engram/runtime/bin/engram.js read --with-revision`, then `node .engram/runtime/bin/engram.js apply --input patch.json --expected-revision <revision>`, followed by `validate`. Add `--history` when this update needs an audit record.

Keep the Cortex concise, evidence-backed, and limited to durable information. Never add source copies, secrets, transient debugging notes, or guesses.

## Use a Cortex during a task

Before investigating, extract two to five distinctive task terms and run:

```sh
node .engram/runtime/bin/engram.js focus --query "merchant transaction authorization"
```

`focus` returns only matching agent-authored entries, a capped `evidence_paths` opening queue, and a correctness gate. Treat it as a navigation map, never proof.

1. Open only `evidence_paths` first. Expand to other source only when a requested answer remains unproven.
2. Read only task-relevant repository instructions. Do not recursively open unrelated imports, credential guidance, or service-operation material; directly applicable instructions still win.
3. Complete the returned correctness gate before answering. For authorization or persistence work, explicitly trace the authorized entity, loaded entity, mutated entity, and post-action behavior.
4. Before closing an investigation, upsert one durable entry when you verified a recurring boundary, state transition, test seam, or correction. Include distinctive keywords and direct evidence; do not save guesses or one-off debugging notes.
