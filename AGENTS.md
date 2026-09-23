# Engram workflow

If `.engram/runtime/bin/engram.js` is absent, bootstrap this checkout before doing Cortex work:

```sh
node bin/engram.js init
```

Read `skills/cerebellum/SKILL.md` before changing the repository Cortex.

Engram does not analyze source code. Agents create and maintain `.engram/cortex.json` through `replace` and `apply` whenever durable repository knowledge changes.
