# Engram eval v2

Run this first:

```sh
npm run eval -- --validate
```

`eval/` is a reproducible agent-evaluation suite, not a prompt demo. Fixtures and prompts are versioned in the repository. Every agent works in a fresh temporary copy. The evaluator stays outside that copy, records a full workspace diff, and runs protected judges after the agent exits.

## Run a development trial

The included Codex adapter has explicit local-trust status. It receives your local Codex configuration, so use it only on a development machine you trust.

```sh
npm run eval -- --adapter eval/adapters/codex-local.json --unsafe-local --scenario tenant-repair
```

Run five repetitions for a comparison. The paired Cortex trial alternates control/treatment order and uses a fresh solver for each side.

```sh
npm run eval -- --adapter eval/adapters/codex-local.json --unsafe-local --scenario tenant-cortex-transfer --repetitions 5
```

Reports are ignored under `eval/results/`. Each records suite and adapter hashes, trial-level duration, token usage when the adapter emits Codex JSONL, protected-judge checks, agent exit state, and every changed or disallowed path.

To turn a completed JSON result into an executive-ready PDF, tell an AI agent to read the exact report with Engram's `evidence-report` skill. The skill must preserve the suite/adapter hashes, trust level, model metadata, and repetition count; it must not combine those measured results with automatic activity estimates.

Copy the adapter for each experiment and set its `metadata` to the exact model, provider, reasoning setting, and agent version. That metadata is written into the report beside the adapter hash; never compare reports that differ on either value without labeling the comparison.

## Safety model

The runner never accepts a shell command. Adapters declare an executable and argument array, so task data cannot be interpreted by a shell.

`local` adapters are intentionally fail-closed behind `--unsafe-local`; a temporary directory is not a security boundary. Use a `container` adapter for a real comparison run. It mounts only the disposable workspace, uses a read-only root filesystem, makes `/tmp` a temporary filesystem, and defaults to `--network none`. [container.example.json](../eval/adapters/container.example.json) is the adapter contract.

Hosted-model agents need an outbound model proxy. Put that proxy on a dedicated Docker network and set the adapter's `network` to its name; do not turn on unrestricted network access or mount a host credential directory.

## What is measured

| Scenario | Primary proof |
| --- | --- |
| `tenant-diagnosis` | Structured answer with citations whose referenced lines prove authorization, lookup, and persistence claims. |
| `tenant-repair` | Protected functional regression plus unchanged-test/full-diff enforcement. |
| `settlement-regression` | Protected test execution, required focused regression behavior, and unchanged production code. |
| `tenant-cortex-transfer` | A teacher creates Cortex; fresh control and treatment agents solve the same held-out diagnosis task. |

Pass rate is the primary metric. Compare token use only among runs with the same suite hash, adapter hash, model settings, and repetition count. Wall time is useful after at least five runs, never from one sample.

## Add a scenario

Add a fixture under `eval/fixtures/`, a suite entry, and a judge under `eval/judges/`. A judge must return JSON `{ passed, checks }` and run outside the agent workspace. Keep fixture tests public; put the proof that determines the score in the protected judge. Declare every permitted source path in `allowed_changes`; any other file mutation fails integrity.
