# Engram

Engram is an AI-maintained repository Cortex: compact, durable context an agent keeps current as it works.

It does not parse, scan, or infer from source code. An agent studies the repository, forms the first Cortex, and updates it whenever its work changes or contradicts what it says.

## First successful workflow

```
bootstrap once                 everyday agent work
──────────────                 ──────────────────
npx … engram init  ───────▶    local runtime → focus → inspect evidence
    │                                  │                │
    ├─ creates .engram/cortex.json     │                ▼
    ├─ installs agent skills            └────────── update Cortex → validate
    └─ installs local runtime
```

After `init`, the repository-local `.engram/runtime` is the command to use. It is copied from the installed package, so normal Cortex work is offline and does not depend on a global install or an npm cache.

```sh
# Run once from the repository that will receive a Cortex.
scratch_cache="$(mktemp -d)" npm_config_cache="$scratch_cache" npx --yes github:grayscale-development/engram init

# Confirm the bootstrap, then give the agent the installed Cerebellum.
node .engram/runtime/bin/engram.js read --with-revision
node .engram/runtime/bin/engram.js validate
```

Expected result: `.engram/cortex.json`, `.engram/skills/engram-workflow/SKILL.md`, `.engram/skills/cerebellum/SKILL.md`, `.engram/skills/evidence-report/SKILL.md`, `.engram/skills/protected-evaluation/SKILL.md`, and `.engram/runtime/bin/engram.js` exist. If any is absent, rerun `init` with the bootstrap command above before asking an agent to update the Cortex.

## Copy this prompt into your agent

```text
Set up Engram in this repository.

1. Bootstrap once with an isolated temporary npm cache, then run `npx --yes github:grayscale-development/engram init`. This needs network access only for the bootstrap command; `init` installs the local runtime used afterward.
2. Read `.engram/skills/engram-workflow/SKILL.md`, then `.engram/skills/cerebellum/SKILL.md`, and follow them exactly.
3. Analyze this repository as an experienced engineer, then form the first concise Cortex in a JSON file. Include only durable product areas, workflows, decisions, and conventions with evidence paths.
4. Run `node .engram/runtime/bin/engram.js read --with-revision`, then use its `revision` in `replace --input cortex.json --expected-revision <revision>`.
5. Run `node .engram/runtime/bin/engram.js validate`.
6. From now on, read a fresh revision before every `apply` or `replace`, then update the Cortex immediately after meaningful code changes or discovered mismatches.
```

## Commands

```sh
# Bootstrap only: use an isolated npm cache if the default cache is not writable.
scratch_cache="$(mktemp -d)" npm_config_cache="$scratch_cache" npx --yes github:grayscale-development/engram init
# All normal work is offline from the target repository.
node .engram/runtime/bin/engram.js read
node .engram/runtime/bin/engram.js read --with-revision
node .engram/runtime/bin/engram.js read --pretty
node .engram/runtime/bin/engram.js focus --query "authorization persistence" --limit 5 --evidence-limit 5
node .engram/runtime/bin/engram.js replace --input cortex.json --expected-revision <revision>
node .engram/runtime/bin/engram.js apply --input patch.json --expected-revision <revision>
node .engram/runtime/bin/engram.js apply --input patch.json --expected-revision <revision> --history
node .engram/runtime/bin/engram.js history
node .engram/runtime/bin/engram.js evidence
node .engram/runtime/bin/engram.js evidence --export engram-evidence-export.json
node .engram/runtime/bin/engram.js doctor
node .engram/runtime/bin/engram.js mcp-config --host codex
node .engram/runtime/bin/engram.js bundle --output engram-team-bundle.json
node .engram/runtime/bin/engram.js migrate
node .engram/runtime/bin/engram.js validate
```

`read` and the stored Cortex use compact JSON by default to keep agent context and disk I/O small. Add `--pretty` only when a formatted display is useful.

For an agent host with MCP support, run `mcp-config` to print a host-specific local-server snippet. It returns a Cortex plus revision, requires that revision on every mutation, and reports conflicts as structured data. See [connect an AI host](docs/hosts.md) and [the MCP workflow](docs/mcp.md).

Run `npm run bench` for repeatable local storage and CLI measurements. The architecture findings and measurement protocol are in [the performance report](docs/performance-report.md).

Run `npm run eval -- --validate` to validate the protected agent-evaluation suite. A scenario runs in a fresh fixture copy while its evaluator stays outside the agent workspace and rejects undeclared file mutations. Use an explicit adapter and `--unsafe-local` only for trusted local development; use the container adapter contract for real comparisons. See [evaluation](docs/evaluation.md).

Engram automatically records local setup, CLI/MCP activity, and focus-context sizing in `.engram/evidence.ndjson`. The checked-in `.engram/evidence.json` makes the local-only setting, opt-out, and bounded retention explicit. The `evidence` command summarizes that bounded local record; `--export` creates a deliberate JSON handoff. It never treats activity or context-size estimates as measured task performance.

## Ask your AI for an evidence report

Copy this prompt into your AI, then replace the bracketed question with what you want to know:

```text
Use this repository's Engram evidence-report skill to answer this question:

[What do you want to know about Engram's activity or impact?]

If `.engram/skills/evidence-report/SKILL.md` or `.engram/runtime/bin/engram.js` is missing, bootstrap Engram with:
scratch_cache="$(mktemp -d)" npm_config_cache="$scratch_cache" npx --yes github:grayscale-development/engram init

Read the evidence-report skill, inspect the local evidence, and generate a polished PDF report. Separate observed activity and estimates from measured task outcomes. Render and verify the PDF before giving it to me, then summarize its findings in this conversation. Do not start a browser or local server.
```

The installed Cerebellum explains the Cortex and update workflow. See [the Cortex format](docs/brain-format.md), [the agent workflow](docs/agent-workflow.md), [the team workflow](docs/team-workflow.md), [the MCP workflow](docs/mcp.md), and [compatibility and upgrades](docs/compatibility.md).

For contributors, run `npm ci`, then `npm run lint`, `npm test`, `npm run eval -- --validate`, and `npm run smoke:package`. The last command packs the current checkout, installs that archive into a clean temporary project, runs `init`, and verifies the installed local runtime.
