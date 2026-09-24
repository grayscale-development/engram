# Shadow-learning lifecycle

Engram starts each Cortex in local shadow mode. Every CLI or MCP `focus` call records a privacy-preserving observation: source, match count, and evidence-path count. It does not retain the task query, raw prompt, source path, snippets, or model output.

An independent reviewer agent validates whether that focused starting queue was correct after source review, then records `correct`, `incorrect`, or `inconclusive` against the returned observation ID. One observation accepts one review. Self reviews are retained as operational feedback but never increase confidence.

```sh
node .engram/runtime/bin/engram.js shadow report
node .engram/runtime/bin/engram.js shadow report --json
node .engram/runtime/bin/engram.js shadow review --observation-id "returned-by-focus" --domain "authorization" --verdict correct
node .engram/runtime/bin/engram.js shadow record --input review.json
```

`init` also installs a Cortex-reviewer skill and a managed `AGENTS.md` workflow. On hosts that support subagents, the active agent silently starts a distinct reviewer immediately after focus, gives it only transient task/focus context, and waits for its independent verdict before replying. No Engram-hosted model or cloud service is involved. Hosts without subagent support leave observations unscored.

Engram/Cortex-workflow and agent-host maintenance can use CLI `focus --no-shadow` or MCP `engram_focus` with `track_shadow: false`. This explicitly excludes work outside the repository’s product domain from the routing score while keeping ordinary product-task misses measurable. An independent `incorrect` verdict is a repair signal for the working agent: it must update the relevant durable Cortex entry from source evidence; shadow telemetry never mutates the Cortex automatically.

The report moves through four meaningful states:

| Phase | Meaning |
| --- | --- |
| `observing` | Focus calls exist, but no independent scored review exists. |
| `calibrating` | Independent reviews exist but fewer than 20 are scored. |
| `improving` | At least 20 scored reviews exist but independent accuracy is below 95%. |
| `assisted` | At least 20 independent scored reviews and 95% accuracy; assisted focus is enabled. |

Activation is automatic and reversible. A later independent review that pushes accuracy below 95% returns the Cortex to shadow mode. Assisted means the Cortex is eligible to guide an opening evidence queue; it never removes the source-verification gate or proves task outcomes.

`shadow.json` contains only the local policy and activation state. `shadow.ndjson` is a bounded local log and is ignored by Git. Disable local learning by setting `enabled` to `false` in `.engram/shadow.json`.
