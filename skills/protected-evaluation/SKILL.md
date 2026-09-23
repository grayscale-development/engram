---
name: protected-evaluation
description: Run or interpret Engram's protected agent evaluation only when a user asks for measured control-versus-Cortex evidence. Use for outcome, token, latency, or pass-rate comparison claims; not for ordinary local activity reporting.
---

# Protected Engram evaluation

Use this workflow only for a measured claim. Automatic evidence is not an evaluation.

1. Read `docs/evaluation.md` and validate the suite before a run:

   ```sh
   npm run eval -- --validate
   ```

2. Use a fresh control/treatment pair, a fixed adapter, fixed model settings, and at least five repetitions. Keep the agent outside the evaluator: use a container adapter for a real comparison. `--unsafe-local` is only for trusted development.

3. Run the paired scenario and retain the JSON report plus its trace directory:

   ```sh
   npm run eval -- --adapter path/to/container-adapter.json --scenario tenant-cortex-transfer --repetitions 5 --output eval/results/engram-comparison.json
   ```

4. Interpret only the protected report. Label suite hash, adapter hash, trust level, model metadata, repetitions, comparable pairs, pass-rate delta, duration delta, and token delta when reported. A result applies only to that experiment.

5. For a founder-ready artifact, give the exact JSON report path to the `evidence-report` skill. It will incorporate the measured result into a rendered PDF and distinguish it from local activity estimates.

Never replace a container comparison with an automatic-evidence estimate. Never allow an agent to grade its own workspace changes.
