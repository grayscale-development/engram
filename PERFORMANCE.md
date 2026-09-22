# Graph-AI performance ledger

This file tracks measured performance work as Graph-AI develops. Measurements are intentionally local and reproducible; they are not marketing benchmarks.

## How to measure

Run from the repository root on a quiet machine:

```sh
npm test
npm run lint
/usr/bin/time -p node bin/graph-ai.js build
/usr/bin/time -p node bin/graph-ai.js build
node bin/graph-ai.js stats
```

The first build captures changed-file work. The immediate second build is the incremental baseline. Runtime includes Node startup, scanning, hashing, graph load, and graph write. Token estimates are characters ÷ 4 and are deliberately approximate.

## Measurements

| Date | Change | Indexed files | Source bytes | Graph bytes | Graph/source | Changed build | Unchanged build | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2026-09-21 | v0.1 pretty JSON baseline | 20 | 35,522 | 102,427 | 288.3% | not recorded | not recorded | Parser nodes/edges are useful but JSON whitespace was expensive in a small repository. |
| 2026-09-21 | v0.2 compact JSON + unchanged parser reuse | 20 | 36,780 | 71,136 | 193.4% | 0.35s (6 files parsed) | 0.33s (0 files parsed) | Graph is 31,291 bytes / 30.6% smaller than the v0.1 artifact. Scan/hash/Node startup dominate this tiny repository, so elapsed time is not yet a meaningful speedup signal. |
| 2026-09-21 | post-v0.2 lifecycle/status development | 22 | 42,955 | 74,777 | 174.1% | not rerun | not rerun | New functionality increased both source and graph content; graph/source ratio improved because the new source is more substantial than its added structural metadata. |
| 2026-09-21 | retrieval evaluator + loan fixture | 48 | 56,279 | 113,269 | 201.3% | not rerun | not rerun | The fixture adds deliberately indexed source, docs, tests, and semantic-delta data. The ratio increase is a reminder that the current explicit JSON node schema remains the next storage-cost target. |
| 2026-09-21 | v0.3 gzip JSON storage | 48 | 58,069 | 12,873 | 22.2% | not rerun | not rerun | 100,396 bytes / 88.6% smaller than the same explicit graph before compression. `inspect` and `export` preserve human/CI access; Git binary diffs are the intentional tradeoff. |
| 2026-09-21 | batched Git ignore check | 500 synthetic TS files | n/a | 54,657 | n/a | 1%: 53.41ms (5 parsed) | 0%: 52.62ms (0 parsed) | Replaced one `git check-ignore` process per file with one batched invocation. The same 500-file benchmark was ~4.45s before and 52.62ms after for an unchanged rebuild. |
| 2026-09-21 | v1 benchmark verification | 500 synthetic TS files | n/a | 54,656 | n/a | 1%: 52.68ms (5 parsed) | 0%: 53.88ms (0 parsed) | Full build: 126.06ms (501 parsed); 5%: 54.94ms (25 parsed); 100%: 116.8ms (500 parsed); RSS: 101,433,344 bytes. |

## Implemented optimizations

1. **Compact storage serialization** — `.ai/graph` remains versioned JSON but no longer writes indentation. `graph-ai inspect`, `query`, and `overview` remain the human/agent inspection interface.
2. **Incremental parser reuse** — file hashes select added/modified/deleted files. Parser-owned nodes and import edges for unchanged files are retained. `build` and `sync` report `Parsed this run`.
3. **Regression coverage** — the test suite verifies an unchanged rebuild parses zero files and a one-file edit parses one file.
4. **Exact freshness reporting** — `status` compares current safe-file hashes with the graph index and reports added, modified, and deleted paths. This is a correctness/observability improvement; it deliberately reuses the scanner, so its runtime cost should be measured on large fixtures before optimizing it.

## Context quality evaluation

The first realistic fixture is `examples/loan-fulfillment`: 25 files spanning a frontend, API layer, controller/service/repository backend, tests, architecture docs, a legacy constraint, and five semantic nodes. `graph-ai evaluate --fixture examples/loan-fulfillment` is deterministic and runs without an AI provider.

| Date | Query set | Required-file recall | File precision | Semantic-fact recall | Mean packet tokens | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 2026-09-21 | 4 loan-fulfillment tasks, initial broad expansion | 100.0% | 30.0% | 100.0% | 316 | Correct but too many adjacent files. |
| 2026-09-21 | Same set, evidence-weighted files + direct term boost | 100.0% | 42.5% | 100.0% | 181 | The evaluator now guards this floor: ≥40% precision and ≤250 mean tokens. |
| 2026-09-21 | 3 organization-access tasks, including unrelated negative query | 100.0% | 60.0% | 100.0% | 136 | Negative-query rejection: 100%; verifies Python-first retrieval independently of the loan fixture. |
| 2026-09-22 | Two-tier source ranking: start files vs adjacent context | 100.0% | 75.0% | 100.0% | 197 | Loan fixture: up to three `START HERE` files, role/path priors, and redundancy penalty; supporting files move to `ALSO RELEVANT`. |
| 2026-09-22 | Same two-tier ranking, organization-access fixture | 100.0% | 77.8% | 100.0% | 148 | Negative-query rejection remains 100%; independent Python-first fixture confirms the gain. |

## Metrics to track next

- Large fixture repository: scan time, parse time, save time, peak memory, and graph size.
- Changed-file ratios: 0%, 1%, 5%, and 100% source modifications.
- Context precision: recommended-file recall against task fixtures.
- Graph churn: byte and line deltas for a typical one-file code change.
- Storage alternatives: compact schema or compressed binary plus deterministic inspect/export.

## Guardrails

Do not trade away these properties merely to improve a number: local-only operation, source never copied into the graph, deterministic structural facts, inspectable semantic provenance, and one portable `.ai/graph` artifact.
