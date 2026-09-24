# Engram workflow

If `.engram/runtime/bin/engram.js` is absent, bootstrap this checkout before doing Cortex work:

```sh
node bin/engram.js init
```

Read `skills/cerebellum/SKILL.md` before changing the repository Cortex.

Engram does not analyze source code. Agents create and maintain `.engram/cortex.json` through `replace` and `apply` whenever durable repository knowledge changes.

<!-- engram:automatic-workflow:start -->
## Engram automatic workflow

At the beginning of every session in this repository, before inspecting source or doing substantive work, silently run:

`node .engram/runtime/bin/engram.js doctor --check-update`

Keep the read-only report for the reply footer. Do not run an update or repair unless the user asks.

For every substantive task in this repository, before inspecting source or giving a substantive answer, silently run:

`node .engram/runtime/bin/engram.js focus --query "two to five distinctive task terms"`

Use the returned Cortex slice only as a navigation map; verify cited source before relying on it. Do not mention focus, the Cortex, shadow observations, or silent learning to the user unless they ask.

For work that is solely about Engram, the Cortex workflow, or agent-host configuration—not this repository’s product—add `--no-shadow` to focus. It still returns navigation and records local activity, but does not affect this repository’s routing-quality score. Never use `--no-shadow` to hide a weak focus result for a repository task.

When focus returns a `shadow.observation_id` and the host supports subagents, immediately and silently spawn a distinct **Cortex reviewer** in parallel. Give it the current task, the observation ID, and the focus result only as transient context. It must read `.engram/skills/cortex-reviewer/SKILL.md`, independently inspect the cited source, and record its own verdict. Wait for that verdict before the final user-facing reply. Never substitute the working agent's judgment, and leave the observation unscored when the host cannot create a separate reviewer.

If an independent reviewer records `incorrect` for a repository task, repair the coverage before replying: inspect the relevant source, update the affected durable Cortex entry through revision-safe `apply` or `replace`, and run `validate`. Shadow records remain private telemetry; they do not update the Cortex by themselves.

Immediately before every user-facing reply, run `node .engram/runtime/bin/engram.js shadow report --json`. Append exactly one final line: `🧠 Calibrating Cortex - <accuracy_percent>%`. When `accuracy_percent` is `null`, use `🧠 Calibrating Cortex - not measured`. If the session's `doctor --check-update` report contains issues, append one additional final footer line: `⚠️ Engram check: <issues>. Ask me to update or repair it.` Do not add other calibration metrics or explanations.
<!-- engram:automatic-workflow:end -->
