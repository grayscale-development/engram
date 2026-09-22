# Cortex format

`.engram/cortex.json` is deliberately small and agent-authored.

```json
{
  "repository": { "name": "repo", "root": "." },
  "chart": {
    "summary": "One concise description of the repository.",
    "areas": [],
    "workflows": [],
    "decisions": [],
    "conventions": []
  }
}
```

Each Cortex item needs an `id`, `label`, `summary`, and evidence paths when available. Keep only durable information another agent needs to work effectively.

Engram persists compact JSON and `read` returns compact JSON by default because agents consume structured context directly. Use `engram read --pretty` only for a formatted display.

## AI working-set limits

The validator rejects Cortex data over 1 MiB serialized or 5,000 total entries. IDs, labels, summaries, evidence counts, and evidence-path lengths are also bounded. These limits prevent an agent from turning the Cortex into a source dump; a normal repository should remain well below 100 durable entries.

## Revisions and history

`read --with-revision` returns the SHA-256 revision of the exact compact snapshot. `apply` and `replace` require that revision, so a stale agent receives a conflict instead of overwriting a newer update. Add `--history` to either command to append an optional content-addressed audit event. Every 50 audit events creates a recovery snapshot under `.engram/history/`; the working Cortex remains the only authoritative current state.
