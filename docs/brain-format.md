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
