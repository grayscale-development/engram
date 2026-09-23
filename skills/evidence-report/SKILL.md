---
name: evidence-report
description: Read local Engram automatic-evidence data and generate a polished PDF answering a user's specific question. Use when asked for a report about Engram activity, focus use, context reduction, or evaluation evidence in a repository.
---

# Engram evidence report

Generate a polished PDF that answers the user's actual question from local evidence. The user may ask for a quick status, an executive summary, a technical audit, or a specific comparison; match the requested format rather than forcing a template.

## Read the evidence

1. Confirm `.engram/runtime/bin/engram.js` and this skill exist. If either is missing, bootstrap from the repository root:

   ```sh
   scratch_cache="$(mktemp -d)" npm_config_cache="$scratch_cache" npx --yes github:grayscale-development/engram init
   ```

2. Run:

   ```sh
   node .engram/runtime/bin/engram.js evidence
   ```

3. Use its summary as the source of truth. Read the Cortex only when the user's question needs repository context:

   ```sh
   node .engram/runtime/bin/engram.js read --with-revision
   ```

4. If the user identifies an Engram eval v2 JSON report, read that exact file as a separate evidence source. Accept only a report with `schema_version: 2`; retain its suite hash, adapter hash, trust level, repetitions, and paired-comparison summary in the PDF. Do not infer a result from an unverified file or from automatic evidence.

## Create the PDF

1. Use the host's PDF-generation workflow. Write the final file to `output/pdf/engram-evidence-report.pdf` unless the user requests a different filename or location.
2. Use a professional, skimmable layout: clear title, report date, the user's question, findings, metric labels, limitations, and one concrete next action when useful.
3. Render and visually inspect the final PDF before delivering it. Fix clipped text, overflow, unreadable tables, or weak hierarchy before handoff.
4. Return the final PDF to the user with a brief one-paragraph summary in the conversation.

## Report honestly

- State what the local record shows: setup, first maintained Cortex when available, CLI/MCP activity, focused-task count, and estimated Cortex-context reduction.
- Clearly separate estimates from measurements. Focus sizing is not total model-token savings, cost, latency, or task success.
- A protected paired evaluation can support an outcome comparison only for its exact fixture, suite, adapter, model settings, and repetition count. State those boundaries next to the result.
- If no paired evaluation report is available, say that success and performance outcomes are unknown. Do not manufacture comparisons.
- Do not expose raw evidence-log contents, task prompts, source snippets, or paths unless the user explicitly asks and the data is available from another approved source.
- The PDF is the deliverable. Do not start a browser, local server, or unrelated workflow.
