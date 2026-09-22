# Engram

Engram is an AI-maintained repository Cortex: compact, durable context an agent keeps current as it works.

It does not parse, scan, or infer from source code. An agent studies the repository, forms the first Cortex, and updates it whenever its work changes or contradicts what it says.

## Copy this prompt into your agent

```text
Set up Engram in this repository.

1. Run `npx --yes github:grayscale-development/engram init`.
2. Read `.engram/skills/cerebellum/SKILL.md` and follow it exactly.
3. Analyze this repository as an experienced engineer, then form the first concise Cortex in a JSON file. Include only durable product areas, workflows, decisions, and conventions with evidence paths.
4. Run `npx --yes github:grayscale-development/engram read --with-revision`, then use its `revision` in `replace --input cortex.json --expected-revision <revision>`.
5. Run `npx --yes github:grayscale-development/engram validate`.
6. From now on, read a fresh revision before every `apply` or `replace`, then update the Cortex immediately after meaningful code changes or discovered mismatches.
```

## Commands

```sh
npx --yes github:grayscale-development/engram init
npx --yes github:grayscale-development/engram read
npx --yes github:grayscale-development/engram read --with-revision
npx --yes github:grayscale-development/engram read --pretty
npx --yes github:grayscale-development/engram replace --input cortex.json --expected-revision <revision>
npx --yes github:grayscale-development/engram apply --input patch.json --expected-revision <revision>
npx --yes github:grayscale-development/engram apply --input patch.json --expected-revision <revision> --history
npx --yes github:grayscale-development/engram history
npx --yes github:grayscale-development/engram validate
```

`read` and the stored Cortex use compact JSON by default to keep agent context and disk I/O small. Add `--pretty` only when a formatted display is useful.

For an agent host with MCP support, install the package and configure the persistent `engram-mcp` stdio command. It returns a Cortex plus revision, requires that revision on every mutation, and reports conflicts as structured data. See [the MCP workflow](docs/mcp.md).

Run `npm run bench` for repeatable local storage and CLI measurements. The architecture findings and measurement protocol are in [the performance report](docs/performance-report.md).

The installed Cerebellum explains the Cortex and update workflow. See [the Cortex format](docs/brain-format.md), [the agent workflow](docs/agent-workflow.md), and [the MCP workflow](docs/mcp.md).
