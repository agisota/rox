# codebase-memory MCP (opt-in)

The `codebase-memory` MCP server is **opt-in** and intentionally **not** wired
into the shared, committed agent configs (`.codex/config.toml`, `opencode.json`,
`.mcp.json`).

## Why it is opt-in

The server runs a local binary (`codebase-memory-mcp`). If that binary is added
to a shared committed config, every agent run on a machine — or in CI — that
does not have the binary installed fails to start the MCP server. To keep the
shared config working for everyone, enable it only in your machine-local config.

## Enabling it (per developer)

1. Install the `codebase-memory-mcp` binary so it is on your `PATH`.
2. Add the server to your machine-local agent config (not committed):

   **Codex** — your local Codex config (`.codex/config.toml` already has a
   commented example you can uncomment locally without committing):

   ```toml
   [mcp_servers.codebase-memory]
   command = "codebase-memory-mcp"
   ```

   **OpenCode** — add to your local `opencode.json` `mcp` block:

   ```json
   "codebase-memory": {
     "type": "local",
     "command": ["codebase-memory-mcp"]
   }
   ```

3. Verify the binary launches: `codebase-memory-mcp --help`.

## Do not commit the enabled entry

Keep these entries out of committed shared config. If we later make the binary a
managed dependency (installed by setup scripts and available in CI), we can
revisit committing it to the shared config.
