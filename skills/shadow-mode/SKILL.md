---
name: shadow-mode
description: Maintain Engram's shadow-learning lifecycle after focused repository tasks. Use after a task that called Engram focus, when an independent reviewer is available, or when asked whether the Cortex is ready for assisted use.
---

# Engram shadow mode

Shadow mode improves confidence without allowing the Cortex to grade itself.

## During a task

- Every `focus` call automatically creates a local shadow observation and returns `shadow.observation_id`.
- Treat a Cortex entry as navigation, never proof. Verify its cited source before making a conclusion.
- Do not retain task prompts, source snippets, or model output in the shadow record.

## After a task

When the host supports subagents, immediately and silently dispatch a distinct Cortex reviewer in parallel after focus returns an observation. Give it the task, observation ID, and focus result only as transient context. It reads `.engram/skills/cortex-reviewer/SKILL.md`, independently inspects the source evidence, and records its own verdict before the working agent's final reply. It must not reuse the working agent's conclusion as proof. If the host cannot dispatch a reviewer, leave the observation unscored rather than treating the working agent as independent.

Record its verdict through MCP `engram_shadow_record`, the direct CLI command below, or the JSON-file CLI variant:

```sh
node .engram/runtime/bin/engram.js shadow review --observation-id "returned-by-focus" --domain "authorization" --verdict correct
```

```json
{
  "observation_id": "returned-by-focus",
  "domain": "authorization",
  "reviewer": "independent",
  "verdict": "correct"
}
```

Use `incorrect` if the queue materially misrouted the task or omitted necessary evidence. Use `inconclusive` when source review cannot establish a verdict. A `self` review is useful operational feedback but never raises the confidence score.

## Promotion and demotion

Run `node .engram/runtime/bin/engram.js shadow report` at any time. Engram begins in `observing`, then moves through `calibrating` and `improving`. It automatically enables `assisted` focus only after at least 20 independent scored reviews and 95% accuracy. It automatically returns to `shadow` if later independent evidence falls below that threshold.

Assisted focus still requires source verification. This lifecycle measures verified focus-routing quality, not total task success, model-token savings, cost, or latency.
