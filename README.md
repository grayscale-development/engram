# Graph-AI

An auto-maintained manual for software repositories.

Graph-AI creates `.ai/graph`, a lightweight repository intelligence file that helps AI coding agents quickly understand the codebase, product, architecture, workflows, engineering conventions, and important decisions.

AI coding agents repeatedly rediscover repositories: they trace imports, reconstruct architecture, learn terminology, and infer conventions. Most of that understanding disappears when the session ends. Graph-AI preserves concise, traceable understanding inside the repository.

`README.md` → humans · `AGENTS.md` → agent instructions · `.ai/graph` → repository understanding

```
SOURCE REPOSITORY → graph-ai build → .ai/graph
                                      │
                         AI context ←─┴─→ graph-ai sync ← semantic delta
```

## Quick start

```sh
git clone https://github.com/grayscale-development/graph-ai.git
cd graph-ai
npm ci
npm link
graph-ai init
graph-ai overview
graph-ai context "change ignored file handling" --tokens 1200
```

No network, API key, cloud account, or external model is required.

## Commands

`init`, `build`, `diff`, `overview`, `context`, `query`, `inspect`, `export`, `add`, `sync`, `status`, `stats`, `evaluate`, and `benchmark` are implemented. Run `graph-ai help` for syntax.

Typical lifecycle:

```sh
graph-ai init
graph-ai context "fix saved card selection" --tokens 1200
# make and test the code change
graph-ai sync --input semantic-delta.json
```

`sync` accepts a small agent-authored JSON delta rather than allowing agents to rewrite the graph. `add` creates protected human canonical knowledge:

```sh
graph-ai add frontend "New user interfaces use React." --evidence AGENTS.md
```

Scope a rule when it applies only to part of the repository:

```sh
graph-ai add frontend "Use React Query for remote state." --scope frontend --evidence AGENTS.md
```

For stale agent knowledge, a delta can explicitly verify or delete the existing node by ID. Canonical human knowledge remains protected from agent overwrite or deletion.

`.ai/graph` is versioned gzip-compressed JSON: compact, portable, and inspectable with `graph-ai inspect`. Use `graph-ai export --output graph.json` when a full readable artifact is needed for review or CI. Graph-AI transparently reads older plain-JSON v0.1/v0.2 graphs and rewrites them in the compact v0.3 form on the next build or sync. It stores hashes, metadata, symbols, dependency relationships, compact semantic nodes, and evidence references—never source-file copies or secret values.

Use `graph-ai diff` before `build` or `sync` to preview changed paths, node/edge counts, and semantic knowledge that would become stale. This is the review-friendly counterpart to the compact binary artifact.

Context packets deliberately separate source recommendations into `START HERE` (up to three implementation files to open first) and `ALSO RELEVANT` (tests, documentation, decisions, and adjacent code). This keeps the first action small without hiding useful supporting context.

## What v1 indexes

JavaScript, TypeScript, and Python receive Tree-sitter structural extraction for declarations, imports, calls, endpoints, and tests. Other text files retain safe metadata. The scanner honors `.gitignore`, skips common dependency/build folders, and excludes obvious secret files.

Semantic nodes are submitted through a structured delta. Parser facts are `derived`; agent facts are `inferred`; `graph-ai add` creates protected `canonical` human knowledge. Evidence changes mark non-canonical semantic nodes `possibly_stale`, which is surfaced lazily in future context packets. Agent knowledge that directly contradicts a same-scope canonical rule is accepted only with an explicit warning; canonical intent is never silently changed.

`graph-ai status` computes freshness from indexed content hashes and reports exact added, modified, and deleted files. This is more reliable than treating every dirty Git worktree as a structural graph change.

Content-identical file moves are detected as renames. Evidence and code-file relationships follow the new path without unnecessarily staling the associated semantic knowledge.

## Implementation architecture

- **Scanner:** recursively discovers safe text files, honors Git and basic `.gitignore` rules, skips generated/dependency folders, and excludes obvious secrets.
- **Indexer:** hashes files, identifies added/modified/deleted paths, extracts JS/TS/Python declarations, relative imports, routes, and test files, then constructs nodes and edges.
- **Storage:** `.ai/graph` is a single versioned JSON artifact. Source is referenced by path and hash; it is never copied into the graph.
- **Retrieval:** local token/identifier/path overlap, authority, freshness, and graph-adjacent evidence select a bounded context packet. Token counts use the documented character÷4 approximation.
- **Semantic layer:** deltas carry type, label, statement, evidence, related node IDs, confidence, and provenance. Changed evidence marks knowledge for lazy verification; canonical nodes cannot be overwritten by agent input.

## Demo and validation

`npm run demo` runs two simulated sessions against `examples/checkout-app`: session A records saved-card behavior, and session B retrieves the workflow, behavior, and three relevant files in a 125-token context packet. `npm test` covers scanning and ignores, graph construction/import edges, serialization, context budgets, semantic provenance, stale-on-modification, stale-on-deletion, and canonical protection.

`graph-ai evaluate --fixture examples/loan-fulfillment` runs a local retrieval evaluation over a layered frontend/API/service fixture. It reports required-file recall, recommendation precision, semantic-fact recall, and packet size. This keeps Graph-AI focused on its actual hypothesis: a small packet should identify the right source and durable knowledge for a fresh agent.

## v1 priorities

1. Add language-specific route extraction and framework-aware symbols.
2. Improve relation-aware ranking beyond lexical and evidence weighting.
3. Add more independent fixtures and real-world corpus evaluation.
4. Introduce a compact node/edge schema beneath the compressed storage format for very large repositories.
5. Expand language support based on measured repository demand.

## Limitations

Graph-AI remains intentionally local and compact. Rename tracking is currently path-based, import resolution is relative-only, and contradiction detection is limited to canonical overwrite protection. Tree-sitter support currently covers JavaScript, TypeScript, and Python; other languages receive safe file-level indexing.
