# Agent benchmark lab

Run this first:

```sh
npm run bench:agent -- --validate
```

It checks the local fixtures and their intended baselines without calling an AI. The lab stays entirely in this repository: fixture codebases live under `bench/fixtures/`, task definitions and rubrics live in `bench/agent-scenarios.json`, and generated reports are ignored under `bench/results/`.

## Run an agent

Set one trusted command. The runner invokes it inside a disposable fixture copy and provides the task, result, and optional event-log paths through environment variables.

```sh
export ENGRAM_AGENT_COMMAND='codex exec --ephemeral --sandbox workspace-write -C "$ENGRAM_BENCH_REPO" -o "$ENGRAM_BENCH_RESULT" "$(cat "$ENGRAM_BENCH_TASK")"'
npm run bench:agent
```

For Codex token metrics, add `--json`; its JSONL output is captured from stdout and the runner records the final `turn.completed` usage when present:

```sh
export ENGRAM_AGENT_COMMAND='codex exec --ephemeral --sandbox workspace-write --json -C "$ENGRAM_BENCH_REPO" -o "$ENGRAM_BENCH_RESULT" "$(cat "$ENGRAM_BENCH_TASK")"'
npm run bench:agent -- --scenario tenant-repair
```

Use only a command you trust: it is executed locally with a shell. The fixture copy is isolated, but the runner does not pretend that an arbitrary shell command is sandboxed.

## What is measured

| Scenario | Capability | Objective checks |
| --- | --- | --- |
| `tenant-cortex` | Learning | Cortex has direct evidence and useful keywords, without changing source. |
| `tenant-diagnosis` | Understanding | Diagnosis names the authorization, loaded-record, and persistence boundary with source references. |
| `tenant-repair` | Editing | Existing cross-tenant regression test passes; the agent changes production code, not the test. |
| `settlement-regression` | Verification | Agent adds a focused negative-adjustment test, leaves production code intact, and runs tests. |

Each scorecard records elapsed time, pass/total checks, command result, and—when the command emits Codex JSONL—input/output/reasoning token usage. Reports are comparable because every scenario begins from a clean fixture copy.

## Keep it trustworthy

Add a new scenario only when it has a clear intended behavior and at least one objective check: a test command, immutable fixture file, required changed file, Cortex evidence, or output rubric. Prefer small fault boundaries over broad “build an app” prompts. Run a scenario at least three times before using wall-clock differences to choose a model or prompt; token counts and pass rates are usually more stable.
