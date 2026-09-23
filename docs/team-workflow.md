# Team workflow

The committed Cortex is the shared, agent-authored repository context. Keep it concise enough to review in a normal code review, and treat every entry as navigation rather than proof.

1. Each agent uses `focus` before opening source and reads a fresh revision before a Cortex mutation.
2. Use `apply --history` or `replace --history` for changes that need an audit trail. Review Cortex and code changes together; a history record is recovery evidence, not approval.
3. Use `node .engram/runtime/bin/engram.js bundle --output engram-team-bundle.json` when handing a repository state to another team or agent. This deliberate JSON artifact contains the Cortex snapshot, history verification, and automatic-evidence summary—but not raw evidence events, prompts, snippets, or model output.
4. Keep the bundle private if Cortex content or repository paths are sensitive. It is a shareable convenience artifact, not an access-control boundary.
5. CI validates syntax, tests, eval fixtures, and a packed-install smoke flow. It does not decide whether an agent-authored Cortex claim is true; reviewers still verify cited source evidence.

For a founder-ready analysis, ask an AI agent to use the repository's `evidence-report` skill. Give it the exact protected-evaluation JSON report if you want it to make a measured comparison claim.
