# Connect an AI host

Run this from an initialized repository. It prints a configuration snippet; it never edits a user-level agent configuration for you.

```sh
node .engram/runtime/bin/engram.js doctor
node .engram/runtime/bin/engram.js mcp-config --host codex
node .engram/runtime/bin/engram.js mcp-config --host cursor
node .engram/runtime/bin/engram.js mcp-config --host vscode
node .engram/runtime/bin/engram.js mcp-config --host generic
```

`codex` prints the `~/.codex/config.toml` server block. Current Codex documentation confirms that Codex CLI and its IDE extension share this MCP configuration. Paste the block into that file, then start a new Codex session. [Official Codex MCP guide](https://developers.openai.com/learn/docs-mcp)

`cursor` and `generic` print the standard `mcpServers` JSON object. `vscode` prints the `.vscode/mcp.json` `servers` object. Insert only the `engram` entry if that configuration file already contains other servers.

Each snippet invokes the repository-local server with `node` and an absolute path to `.engram/runtime/bin/engram-mcp.js`. It sends no data over the network. The caller supplies a repository root to each tool, so one server can serve only roots the host is already allowed to access.

## Check the result

Ask the connected agent to call `engram_read`. Then ask it to read `.engram/skills/cerebellum/SKILL.md` before changing durable repository knowledge. Run `doctor` again if the host cannot start the server.
