---
name: engram-workflow
description: Use Engram's repository-local Cortex during engineering work. Use when starting a task in a repository that has `.engram`, when maintaining durable repository knowledge, or when the user asks how Engram has been used.
---

# Engram workflow

## Silent default

For every substantive task, before inspecting source or responding substantively:

1. Extract two to five distinctive task terms and silently run `node .engram/runtime/bin/engram.js focus --query "terms"`.
2. Open only the returned `evidence_paths` first. Cortex entries are a navigation map, not proof.
3. Do not mention focus, the Cortex, shadow observations, or silent learning unless the user asks.
4. When focus returns `shadow.observation_id`, immediately and silently dispatch a distinct Cortex reviewer through the host's subagent capability when available. Give it the task, observation ID, and focus result as transient context; it must read `.engram/skills/cortex-reviewer/SKILL.md`, independently inspect the cited source, and record one verdict before your final reply. If the host cannot dispatch a reviewer, leave the observation unscored rather than treating the working agent as independent.

Check `doctor` once after setup or when the workflow appears unavailable; it is not a substitute for `focus`.

## Reply footer

Immediately before every user-facing reply, run `node .engram/runtime/bin/engram.js shadow report --json`. Append this compact three-line calibration footer, substituting values from the report:

```text
🧠 Cortex calibration  <lifecycle>
Progress to assisted focus  [<ten-cell bar>] <scored_reviews>/<minimum_independent_reviews> independent reviews
<accuracy text> · target <target_accuracy_percent>% · <milestone text>
```

Render `<lifecycle>` as `○ Observing  →  ○ Calibrating  →  ○ Improving  →  ○ Assisted`, replacing only the active stage's `○` with `●`. The active stage is the report phase; map `ready-to-promote` to Assisted. Keep inactive stages hollow, including completed stages, so the active light clearly marks the current step. Use `█` for filled cells and `░` for empty cells; fill `round(10 × min(scored_reviews / minimum_independent_reviews, 1))` cells. Use `<accuracy_percent>% independently verified` as accuracy text, or `Accuracy measuring after the first review` when `accuracy_percent` is `null`. For milestone text: use `first review pending` while observing, `<remaining> reviews to go` while calibrating, `review target met; improve accuracy` while improving, `ready to enable assisted focus` while ready-to-promote, `assisted focus enabled` when assisted, and `shadow learning disabled` when disabled. Do not add raw shadow metrics or explanations.

## Keep knowledge current

- Before changing durable Cortex knowledge, read `.engram/skills/cerebellum/SKILL.md`.
- Read a fresh revision immediately before `apply` or `replace`.
- After a meaningful implementation change or verified recurring discovery, update only the affected compact Cortex entry and run `validate`.
- Do not put source copies, raw prompts, credentials, or guesses in the Cortex.

## Report evidence

- Run `node .engram/runtime/bin/engram.js evidence` for local activity and Cortex-context-sizing estimates.
- For a user-facing document, read `.engram/skills/evidence-report/SKILL.md`; its deliverable is a rendered, visually verified PDF.
- State clearly that local activity and UTF-8-derived context reduction are not measured task success, model tokens, cost, or latency. Use a protected paired evaluation before claiming an outcome delta.

## If Engram is missing

Bootstrap once from the repository root:

```sh
scratch_cache="$(mktemp -d)" npm_config_cache="$scratch_cache" npx --yes github:grayscale-development/engram init
```

Do not start a browser or local server for this workflow.
