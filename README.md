# Engram

Engram is an AI-maintained repository Cortex: compact, durable context an agent keeps current as it works.

It does not parse, scan, or infer from source code. An agent studies the repository, forms the first Cortex, and updates it whenever its work changes or contradicts what it says.

## Copy this prompt into your agent

```text
Set up Engram in this repository.

1. Run `npx --yes github:grayscale-development/engram init`.
2. Read `.engram/skills/cerebellum/SKILL.md` and follow it exactly.
3. Analyze this repository as an experienced engineer, then form the first concise Cortex in `.engram/cortex.json`. Include only durable product areas, workflows, decisions, and conventions with evidence paths.
4. Run `npx --yes github:grayscale-development/engram validate`.
5. From now on, update the Cortex immediately after you change code or notice it disagrees with the repository.
```

## Commands

```sh
npx --yes github:grayscale-development/engram init
npx --yes github:grayscale-development/engram read
npx --yes github:grayscale-development/engram replace --input cortex.json
npx --yes github:grayscale-development/engram apply --input patch.json
npx --yes github:grayscale-development/engram validate
```

The installed Cerebellum explains the Cortex and update workflow. See [the Cortex format](docs/brain-format.md) and [the agent workflow](docs/agent-workflow.md).
