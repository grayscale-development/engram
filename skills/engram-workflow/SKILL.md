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

Immediately before every user-facing reply, run `node .engram/runtime/bin/engram.js shadow report --json`. Append exactly one final line: `🧠 Independent accuracy: <accuracy_percent>%`. If `accuracy_percent` is `null`, append `🧠 Independent accuracy: not measured`. Do not add other shadow metrics unless asked.

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
