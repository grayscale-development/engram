---
name: onboarding
description: Introduce a user to Engram after initialization, then complete either a brief orientation or a fast setup. Use when the user asks to get started, set up Engram, or says to follow this onboarding skill.
---

# Engram onboarding

If `.engram/runtime/bin/engram.js` or this installed skill is missing, bootstrap Engram from the repository root first:

```sh
scratch_cache="$(mktemp -d)" npm_config_cache="$scratch_cache" npx --yes github:grayscale-development/engram init
```

Ask exactly one question before doing setup:

> Would you like **Orientation** (about one minute: what Engram does and how it works) or **Quick setup** (skip the explanation and get it ready now)?

## Quick setup

1. Run `node .engram/runtime/bin/engram.js doctor`.
2. Read `.engram/skills/cerebellum/SKILL.md`.
3. Form the first evidence-backed Cortex, save it through revision-safe `replace`, and run `validate`.
4. Say the Cortex is ready and give one next action: ask the agent to use `focus` at the start of the next task.

Do not explain product concepts beyond what is necessary to complete these steps.

## Orientation

Explain these three points in no more than three bullets:

- Engram is durable, agent-maintained repository context; it does not scan or infer facts from source code.
- The Cortex is a compact map of verified areas, workflows, decisions, and conventions that helps an agent start with relevant evidence.
- Local automatic evidence records Engram activity and estimated Cortex-context reduction; it is not a claim about task success, cost, or total model tokens.

Then follow **Quick setup**.

## After setup

- Use `.engram/skills/engram-workflow/SKILL.md` for ordinary work.
- Use `.engram/skills/evidence-report/SKILL.md` when the user asks for a polished PDF about Engram activity or impact.
- Do not start a browser or local server.
