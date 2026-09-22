# Graph-AI agent workflow

This repository uses Graph-AI. Before broad exploration, run:

1. `graph-ai overview`
2. `graph-ai context "<current task>" --tokens 2000`
3. Inspect the recommended files before expanding the search.

Before finishing work, run tests and `graph-ai sync`. If the task revealed durable product behavior, a workflow, practice, constraint, or decision, submit a compact semantic delta:

```json
{ "changes": [{ "type": "product.concept", "label": "Concept", "statement": "Durable fact.", "evidence": ["src/file.js"] }] }
```

Then run `graph-ai sync --input delta.json`. Do not store transient implementation chatter.
