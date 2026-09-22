# Engram performance and architecture report

## Decision

Keep minified JSON as the Cortex format. It is the fastest complete implementation for the intended compact, agent-authored snapshot, requires no decoder, and is directly usable as structured agent context. A persistent local MCP server now removes Node process startup from the common agent path. Do not port the storage engine to Rust unless profiling later proves that a short-lived native CLI is a hard requirement.

This report is for AI operation, not manual editing. The Cortex should remain a small, durable map of a repository, never a source-code index or a conversation log.

## Agent diagnosis benchmark

On 2026-09-22, the same read-only diagnosis prompts were run with Codex on clean `master` snapshots of a small Ember addon and a .NET API. The baseline had no `.engram` directory. The focused run used a maintained Cortex entry and `focus`, then verified the cited source. The one-time Cortex creation cost is intentionally excluded: this measures the work an agent performs after a Cortex exists.

| Repository / task | Baseline time / input | Focused time / input | Factual checklist |
| --- | ---: | ---: | ---: |
| `nano-utils`: adjusted payoff calculation | 86.34 s / 147,684 | 80.22 s / 98,917 | 6/6 both |
| `API`: cross-app merchant transaction update | 128.47 s / 631,009 | 123.99 s / 150,705 after Cortex maintenance | 7/7 both |

The first focused API run was faster (96.66 s / 561,647 input tokens) but incorrectly said the update publishes under the old app. The baseline investigation established the real post-save behavior: the publish filter detects the changed app identifier and throws before publishing. That invariant was added to the Cortex; the recorded warm rerun is the valid focused result. This is intentional evidence, not a filtered result: Cortex quality depends on agents recording durable discoveries after they verify them.

`init` now installs a local, dependency-free Node runtime under `.engram/runtime`. Normal Cortex work uses that runtime and is independent of npm cache, registry, and GitHub availability. The bootstrap command itself still needs a Node runtime and a way to obtain Engram; use an isolated npm cache when the host cache is not writable.

## What was measured

Measurements ran on 2026-09-22 on darwin-arm64 with Node v22.12.0. The benchmark creates and removes isolated temporary repositories, uses 80 samples for direct storage operations and 30 for CLI operations, and reports p50/p95 wall time. Filesystem cache is warm after one unrecorded invocation. Run it with:

```sh
npm run bench
```

The source workload was profiled read-only: no source file, Git state, `.engram` directory, or remote repository was changed or pushed.

| Repository profile | Tracked files | Disk size |
| --- | ---: | ---: |
| `nano-utils` | 161 | 368,544 KiB |
| `sites` | 152 | 5,444 KiB |
| `loan-documents` | 984 | 3,103,400 KiB |
| `API` | 3,256 | 543,152 KiB |

Those source sizes do not affect Engram latency: the product intentionally never enumerates, parses, or opens repository source files. Cortex size and process startup are the relevant variables. Synthetic Cortex charts were therefore used to make the storage workload repeatable.

## Current speed

The table is after compact JSON, working-set limits, revisions, and locking. `direct apply` is a read-plus-safe-mutation round trip inside an already-running Node process. `CLI apply` performs the same workflow through two fresh commands (`read --with-revision`, then `apply --expected-revision`). Use `engram-mcp` to eliminate those fresh-process starts in agent integrations.

| Cortex entries | Stored bytes | Direct read p50 / p95 | Direct apply p50 / p95 | CLI status p50 / p95 | CLI apply p50 / p95 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 1,635 | 0.077 / 0.217 ms | 0.988 / 1.691 ms | 43.018 / 45.236 ms | 84.981 / 88.391 ms |
| 100 | 14,595 | 0.117 / 0.157 ms | 0.905 / 1.169 ms | 41.267 / 42.605 ms | 85.743 / 89.025 ms |
| 1,000 | 147,795 | 0.603 / 0.863 ms | 3.067 / 5.540 ms | 41.409 / 43.256 ms | 88.091 / 99.245 ms |
| 5,000 | 755,795 | 2.867 / 3.589 ms | 12.219 / 14.277 ms | 47.533 / 59.153 ms | 107.454 / 115.086 ms |

Before the compact-storage change, the same 5,000-entry benchmark persisted 1,125,880 bytes. The change removes about 33% of on-disk and tool-output whitespace without changing the JSON data model. `engram read` is compact by default; `engram read --pretty` remains available for display.

The command shell, not JSON, remains the bottleneck. At 1,000 entries, the complete in-process safe workflow p50 is 3.067 ms while two fresh CLI commands take 88.091 ms. A separate 100-sample startup-floor check measured Node no-op p50/p95 at 30.604/31.693 ms and a compiled Rust no-op at 1.501/2.716 ms. This is not an equivalent Cortex implementation; it isolates the maximum latency opportunity from changing runtime startup.

## Format decision

| Option | Recommendation | Reason |
| --- | --- | --- |
| Minified JSON snapshot | Use now | Native to model/tool structured output, atomic-file friendly, zero dependencies, proven below 5 ms direct at 5,000 entries. |
| Pretty JSON | Do not persist | Costs about one-third more bytes with no agent capability gain. Use `read --pretty` only when needed. |
| MessagePack, CBOR, protobuf | Reject for Cortex | Smaller bytes do not help an agent unless a decoder tool runs first; that loses inspectability and makes failures harder to repair. |
| SQLite | Defer | Useful only for concurrent writers, history, indexes, or queries across tens of thousands of facts. It adds a native/service dependency without helping the current compact snapshot. |
| NDJSON event journal plus materialized JSON snapshot | Optional audited mode | `--history` provides content-addressed events and a checkpoint every 50 writes. The materialized JSON snapshot remains the agent read model. |
| Custom symbolic/positional encoding | Reject | It saves a small amount of bytes while increasing hallucination and repair risk. Stable named fields are the more reliable AI protocol. |

The key optimization is information selection, not a denser serializer: summaries should be short; stable IDs and evidence paths should be retained; source copies, raw logs, and transient debugging notes must stay out of the Cortex.

## Recommended roadmap

1. **Implemented — keep the snapshot small.** Compact JSON and the benchmark are shipped. The validator enforces a 1 MiB serialized maximum, 5,000 entries, and bounded fields; normal repositories should remain below 100 durable entries. Submit all changes from one agent turn in a single `apply` patch.

2. **Implemented — eliminate startup in agent integrations.** `engram-mcp` is a persistent local stdio MCP server with structured `read`, `replace`, `apply`, `validate`, and history-verification tools. Keep the CLI as the portable fallback; use MCP for normal agent work.

3. **Implemented — make simultaneous agents correct.** `read --with-revision` and `engram_read` return a SHA-256 revision. Every mutation requires that exact revision inside an exclusive lock. Stale writers receive `REVISION_CONFLICT` with the current snapshot; overlapping writes receive `CORTEX_BUSY` instead of silently overwriting facts.

4. **Implemented — separate working state, audit, and retrieval.** The local Cortex is authoritative. Optional `--history` creates an append-only content-addressed audit chain with recovery checkpoints every 50 events. `index` and `search` create a separate retrieval artifact from only explicitly listed Cortex roots; they never scan source files.

5. **Rust decision gate.** Build a Rust binary only when profiling shows that fresh-process latency or distribution constraints dominate after the persistent integration is unavailable, for example a hard under-10-ms cold-command requirement or thousands of short-lived invocations per minute. Rust can remove most of the 30-ms startup floor, but it will not improve the central AI quality problem, and a rewrite risks slower iteration and duplicate validation behavior. A persistent Node host already removes the same bottleneck.

## Guardrails for reliable AI use

- Enforce a maximum serialized Cortex size and per-field limits with an actionable error; this prevents an agent from accidentally inserting source dumps. **Implemented.**
- Return machine-readable error objects from the persistent interface so agents can recover deterministically rather than parse prose. **Implemented.**
- Test concurrent mutation and audited recovery checkpoints; atomic writes alone are not conflict resolution. **Implemented.**
- Add a schema validator that rejects unknown top-level fields in the next format version, while retaining explicit migration functions.
- Track p50/p95 for direct and process paths in CI on a fixed runner, with a regression budget rather than a one-time speed claim.
