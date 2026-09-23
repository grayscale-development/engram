# Release checklist

1. Update the package version and changelog.
2. Run `npm ci`, `npm run lint`, `npm test`, `npm run eval -- --validate`, and `npm run smoke:package`.
3. Run the compatibility checks on Node 20 and 22 in CI.
4. If a Cortex format changes, document the exact migration, add a revision-safe implementation, and test both an unchanged and an upgraded repository. Do not publish a version that silently rewrites a Cortex.
5. Pack the artifact and confirm `init`, `doctor`, `migrate`, and the local MCP entry point work in a clean temporary repository.
6. Publish release notes that separate automatic activity/context estimates from protected evaluation outcomes.
