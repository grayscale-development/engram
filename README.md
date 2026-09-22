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
npm install
npm link
graph-ai init
graph-ai overview
graph-ai context "change ignored file handling" --tokens 1200
```

No network, API key, cloud account, or external model is required.

## Commands

`init`, `build`, `overview`, `context`, `query`, `inspect`, `add`, `sync`, `status`, and `stats` are implemented. Run `graph-ai help` for syntax.

`.ai/graph` is versioned, pretty JSON: portable, inspectable, and Git-friendly. It stores hashes, metadata, symbols, dependency relationships, compact semantic nodes, and evidence references—never source-file copies or secret values.

## What v0 indexes

JavaScript, TypeScript, and Python receive regex-based structural extraction for declarations, relative imports, endpoints, and tests. Other text files retain safe metadata. The scanner honors `.gitignore`, skips common dependency/build folders, and excludes obvious secret files.

Semantic nodes are submitted through a structured delta. Parser facts are `derived`; agent facts are `inferred`; `graph-ai add` creates protected `canonical` human knowledge. Evidence changes mark non-canonical semantic nodes `possibly_stale`, which is surfaced lazily in future context packets.

## Limitations

This is deliberately a small prototype: parsing is not yet AST/Tree-sitter precise, rename tracking is path-based, import resolution is relative-only, and contradiction detection is limited to canonical overwrite protection. The graph is optimized for validating the lifecycle, not for universal language coverage.
