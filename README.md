# Graph-AI

Graph-AI is a repository brain maintained by AI agents.

It does not parse, scan, or infer from source code. An agent studies the repository, writes the first compact chart, and updates that chart whenever its work changes or contradicts what the brain says.

## Copy this prompt into your agent

```text
Set up Graph-AI in this repository.

1. Run `npx --yes github:grayscale-development/graph-ai init`.
2. Read `.ai/skills/repository-brain/SKILL.md` and follow it exactly.
3. Analyze this repository as an experienced engineer, then create the first concise repository brain in `.ai/brain.json`. Include only durable product areas, workflows, decisions, and conventions with evidence paths.
4. Run `npx --yes github:grayscale-development/graph-ai validate`.
5. From now on, update the brain immediately after you change code or notice it disagrees with the repository.
```

## Commands

```sh
npx --yes github:grayscale-development/graph-ai init
npx --yes github:grayscale-development/graph-ai read
npx --yes github:grayscale-development/graph-ai replace --input brain.json
npx --yes github:grayscale-development/graph-ai apply --input patch.json
npx --yes github:grayscale-development/graph-ai validate
```

The installed skill explains the chart and update workflow. See [the brain format](docs/brain-format.md) and [the agent workflow](docs/agent-workflow.md).
