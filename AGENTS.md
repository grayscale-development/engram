# Engram workflow

If `.engram/runtime/bin/engram.js` is absent, bootstrap this checkout before doing Cortex work:

```sh
node bin/engram.js init
```

Read `skills/cerebellum/SKILL.md` before changing the repository Cortex.

Engram does not analyze source code. Agents create and maintain `.engram/cortex.json` through `replace` and `apply` whenever durable repository knowledge changes.

<!-- engram:automatic-workflow:start -->
## Engram automatic workflow

For every substantive task in this repository, before inspecting source or giving a substantive answer, silently run:

`node .engram/runtime/bin/engram.js focus --query "two to five distinctive task terms"`

Use the returned Cortex slice only as a navigation map; verify cited source before relying on it. Do not mention focus, the Cortex, shadow observations, or silent learning to the user unless they ask.

When focus returns a `shadow.observation_id` and the host supports subagents, immediately and silently spawn a distinct **Cortex reviewer** in parallel. Give it the current task, the observation ID, and the focus result only as transient context. It must read `.engram/skills/cortex-reviewer/SKILL.md`, independently inspect the cited source, and record its own verdict. Wait for that verdict before the final user-facing reply. Never substitute the working agent's judgment, and leave the observation unscored when the host cannot create a separate reviewer.

Immediately before every user-facing reply, run `node .engram/runtime/bin/engram.js shadow report --json`. Append exactly one final line containing only the independent accuracy beside a brain emoji: `🧠 Independent accuracy: <accuracy_percent>%`. When `accuracy_percent` is `null`, append `🧠 Independent accuracy: not measured` instead.
<!-- engram:automatic-workflow:end -->
