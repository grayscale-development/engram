# Compatibility and upgrades

Engram supports Node.js 20 and 22. CI verifies both supported majors, while the package declaration permits Node 20 or later.

The current Cortex `format_version` is `1`. `node .engram/runtime/bin/engram.js migrate` is read-only: it reports whether the stored Cortex format matches the runtime. It never rewrites repository knowledge without a version-specific, revision-safe migration procedure.

After upgrading the package, run the new package's `init` command once in each repository. It preserves `.engram/cortex.json` and refreshes the dependency-free runtime plus installed skills. Then run:

```sh
node .engram/runtime/bin/engram.js doctor
node .engram/runtime/bin/engram.js migrate
node .engram/runtime/bin/engram.js validate
```

Automatic evidence is local-only and bounded. The setting is stored in `.engram/evidence.json`; upgrading does not upload it or turn on network telemetry.
