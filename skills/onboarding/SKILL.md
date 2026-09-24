---
name: onboarding
description: Guide a user through learning about Engram, setting it up, or repairing and updating an existing installation. Use when the user asks to get started, set up or update Engram, or says to follow this onboarding skill.
---

# Engram onboarding

Ask exactly one question before taking any action:

> Choose one:
>
> A. **Learn** — a one-minute overview, then set Engram up.
> B. **Set up** — get Engram ready now without the overview.
> C. **Repair & update** — refresh an existing Engram installation and verify it.

Accept either the letter or option name. Any question asked during setup, repair, or update must be a closed set of lettered choices (`A.`, `B.`, `C.`, and so on). Do not ask an unlettered yes/no or open-ended question; proceed automatically when no user choice is required.

## B. Set up

After the user chooses **B. Set up**, bootstrap Engram from the repository root when this skill was read directly from GitHub or `.engram/runtime/bin/engram.js` is missing:

```sh
scratch_cache="$(mktemp -d)" npm_config_cache="$scratch_cache" npx --yes github:grayscale-development/engram init
```

1. Run `node .engram/runtime/bin/engram.js doctor`.
2. Read `.engram/skills/cerebellum/SKILL.md`.
3. Silently run `focus` with two to five terms from the setup task, then form the first evidence-backed Cortex, save it through revision-safe `replace`, and run `validate`.
4. Say the Cortex is ready. The installed workflow will use `focus` automatically when it applies; do not ask the user to request it.

Do not explain product concepts beyond what is necessary to complete these steps.

## A. Learn

Explain these three points in no more than three bullets:

- Engram is durable, agent-maintained repository context; it does not scan or infer facts from source code.
- The Cortex is a compact map of verified areas, workflows, decisions, and conventions that helps an agent start with relevant evidence.
- Local automatic evidence records Engram activity and estimated Cortex-context reduction. Shadow mode separately calibrates focus-routing quality through independent reviews; neither is a claim about task success, cost, or total model tokens.

Then follow **B. Set up**.

## C. Repair & update

Always refresh the installation from the repository root, even when a local runtime is present:

```sh
scratch_cache="$(mktemp -d)" npm_config_cache="$scratch_cache" npx --yes github:grayscale-development/engram init
```

1. Run `node .engram/runtime/bin/engram.js doctor`.
2. Say the installation is repaired and updated. The existing Cortex and calibration history are preserved, and the installed workflow will use `focus` automatically when it applies.

If repair cannot complete, offer only lettered recovery choices, such as `A. Retry repair`, `B. Show the diagnostic output`, or `C. Stop`.

## After setup

- Use `.engram/skills/engram-workflow/SKILL.md` for ordinary work.
- The installed workflow silently dispatches `.engram/skills/cortex-reviewer/SKILL.md` through the active host when subagents are available.
- Use `.engram/skills/shadow-mode/SKILL.md` to calibrate the Cortex after focused work.
- Use `.engram/skills/evidence-report/SKILL.md` when the user asks for a polished PDF about Engram activity or impact.
- Do not start a browser or local server.
