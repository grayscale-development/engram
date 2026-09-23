# Security policy

## Trust boundaries

Engram is local-first: its CLI and MCP server read and write files in the repository root selected by the caller. The package has no runtime dependencies and does not transmit repository contents to an Engram-operated service.

The Cortex is agent-authored navigation data, not a secret store or source of authority. Treat every Cortex statement as untrusted until its linked repository evidence is verified. Do not store credentials, access tokens, private keys, customer data, or other secrets in `.engram/cortex.json`, history records, command arguments, or agent prompts. `.engram` is normally repository content and may be committed, backed up, or exposed to every collaborator who can read the repository.

The MCP process inherits the permissions of the account that starts it. Configure it only for repositories and agent hosts you trust. A malicious or over-permissioned agent can ask Engram to modify Cortex files; revision checks prevent silent write conflicts, not authorized-but-bad content.

## Safe operation and recovery

1. Before a mutation, read a current revision and provide it with `--expected-revision`.
2. Use `validate` after a mutation and `--history` when a recovery checkpoint is needed.
3. If a mutation is interrupted, stop concurrent writers, inspect `.engram/cortex.json`, then run `validate`. Do not delete `.engram` files blindly. Preserve a copy of the directory before manual recovery.
4. If a Cortex contains a secret, rotate or revoke that secret first, remove it from the Cortex and its repository history under your organization’s incident process, then assess all clones and backups that may contain it.

## Supported environment

Engram supports Node.js versions declared in `package.json` and a filesystem writable by the invoking user. It is not a sandbox, access-control system, secret manager, or substitute for repository review.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or exposed secret. Report it privately to the repository maintainers; use GitHub’s private vulnerability-reporting channel when it is enabled. Include affected version, reproduction steps or proof of concept, impact, and any suggested mitigation. Maintainers should acknowledge receipt, assess impact, coordinate a fix, and publish a disclosure after affected users have a reasonable upgrade path.
