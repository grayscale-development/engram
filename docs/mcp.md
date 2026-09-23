# Persistent MCP workflow

Use `engram-mcp` as a local stdio MCP server when an agent host supports MCP. It stays alive between tool calls, avoiding the fresh Node-process startup cost of repeated CLI commands.

```json
{
  "mcpServers": {
    "engram": {
      "command": "engram-mcp"
    }
  }
}
```

The server provides seven tools:

1. `engram_read` returns `{ cortex, revision }` from the authoritative local snapshot.
2. `engram_focus` accepts a short task query and returns matching, agent-authored entries, a bounded evidence-opening queue, and a correctness gate. Verify its evidence before relying on it.
3. `engram_apply` accepts `patch` and required `expected_revision`.
4. `engram_replace` accepts `cortex` and required `expected_revision`.
5. `engram_validate` returns a validated snapshot and revision.
6. `engram_history_verify` verifies the optional audit chain and recovery snapshots.
7. `engram_evidence` returns local automatic-evidence activity: setup, Cortex mutations, focus calls, and estimated Cortex-context reduction. It never reports a task outcome as measured unless a paired evaluation report supplies one.

Use the revision returned by `engram_read` exactly once for a mutation. A changed snapshot returns a `REVISION_CONFLICT` with the newest `{ cortex, revision }`; read it, merge the intended durable facts, and retry. A simultaneous write in progress returns `CORTEX_BUSY`; read and retry rather than guessing.

Set `history: true` on `engram_apply` or `engram_replace` only when audit/recovery is required. Audit entries are append-only and content-addressed. The current `.engram/cortex.json` remains the local authoritative working set.

For cross-repository retrieval, create a derived index only from explicit Cortex roots:

```sh
engram index --input roots.json --output cortex-index.json
engram search --index cortex-index.json --query "deployment workflow"
```

`roots.json` is `{ "roots": ["/absolute/repository-a", "/absolute/repository-b"] }`. Indexing opens only each listed `.engram/cortex.json`; it never scans repository source files.

## Automatic evidence

Successful MCP Cortex operations are recorded locally in `.engram/evidence.ndjson`. The record contains operation names, source, duration, Cortex revision/counts, and bounded focus-sizing metrics—not raw task prompts, source snippets, evidence paths, or model output. `.engram/evidence.json` controls local recording and bounded retention; set `enabled` to `false` to opt out. Use `engram_evidence` or the CLI `engram evidence` to inspect its summary. `engram evidence --export report.json` creates an explicit JSON export; no automatic upload exists.
