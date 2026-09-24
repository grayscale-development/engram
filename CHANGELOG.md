# Changelog

## 4.0.2 — 2026-09-23

- Added a read-only `doctor --check-update` session-start check for installed workflow files, Cortex/settings validity, and the published Engram version. It reports any issue in the agent footer without changing the repository.
- Simplified the calibration footer to one accuracy line and removed the stale setup follow-up instruction.
- Added explicit shadow-score exclusion for Engram/Cortex/host maintenance, while requiring source-backed Cortex repairs after independent product-task routing misses.

## 4.0.0 — 2026-09-22

- Replaced the shell-command agent benchmark prototype with protected eval v2: typed adapters, full-diff integrity checks, external judges, reproducible reports, and a paired Cortex transfer experiment.
- Added explicit unsafe-local and container execution contracts; eval fixtures and runners now ship in the npm package.

## 3.3.0 — 2026-09-22

- Added a self-contained agent benchmark lab with disposable fixture repositories and scored learning, understanding, editing, and verification scenarios.
- Added JSON/Markdown scorecards with elapsed time and optional Codex token usage.

## 3.2.0 — 2026-09-22

- Added validated agent-authored retrieval keywords to Cortex entries.
- `focus` and `engram_focus` now return a capped evidence-opening queue and a source-verification correctness gate.
- Made verified investigation memory, scoped instruction reading, and evidence-first expansion explicit Cerebellum requirements.

## 3.1.0 — 2026-09-22

- `init` now installs a self-contained local runtime at `.engram/runtime`, removing network and npm-cache dependencies from normal Cortex reads, mutations, and validation.
- Added task-focused Cortex retrieval through `engram focus` and the `engram_focus` MCP tool.
- Updated the Cerebellum to distinguish task navigation from Cortex maintenance and to emphasize externally exposed, authorization, persistence, state-transition, and test-seam anchors.

## 3.0.0 — 2026-09-22

- Renamed the product to Engram.
- Renamed the repository map to the Cortex and the installed maintenance skill to the Cerebellum.
- Moved repository state to `.engram/cortex.json` and changed the CLI to `engram`.

## 2.0.0 — 2026-09-22

- Replaced source parsing and retrieval with an agent-maintained repository brain.
- Added the universal `repository-brain` skill and bootstrap prompt.
- Removed GitHub Pages and the static website.
