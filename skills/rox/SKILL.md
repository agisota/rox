---
name: rox
description: Create workspaces, spawn agents, schedule automations, and manage Rox projects/tasks/hosts via the `rox` CLI. Use to orchestrate coding agents across devices from the terminal.
allowed-tools: Bash(rox:*)
---

# Rox CLI

The `rox` command provides fast access to spawning subagents and creating copies of projects in isolated workspaces.

If the CLI is not installed, you can install it using `curl -fsSL https://rox.one/cli/install.sh | sh`.

## Core Workflow

1. **Pick a project and host**: `rox projects list` and `rox hosts list`.
2. **Create a Workspace**: `rox workspaces create --project <id> --host <id> --name "..." --branch <branch>` (or `--pr <number>`, or `--local` instead of `--host`).
3. **Spawn an agent**: `rox agents create --workspace <id> --agent claude --prompt "..."`.
4. **Plan work**: `rox tasks create --title "..."` then `tasks update <id-or-slug>` as work progresses.

## Runtime Context

When invoked from inside a Rox workspace or terminal, these environment variables are set and can provide you with context about your session:

- `$ROX_WORKSPACE_ID` — current workspace id (use directly with `agents create --workspace`, `automations create --workspace`, etc.)
- `$ROX_TERMINAL_ID` — current terminal session id

If `$ROX_WORKSPACE_ID` is unset, you're not inside a Rox workspace — follow the Core Workflow above to create one.

## Workspaces

```bash
rox workspaces create --project <id> --host <id> --name "..." --branch <branch>
rox workspaces create --project <id> --local --name "..." --pr <number>
rox workspaces list [--host <id> | --local]
rox workspaces update <id> --name "..."
rox workspaces delete <id> [<id>...]
```

Provide exactly one of `--branch` or `--pr`. With `--pr`, the host checks out the verified PR head and derives the branch. `--base-branch <name>` is the fork point when `--branch` doesn't exist yet.

Optionally act on the new workspace as soon as it's materialized:

```bash
rox workspaces create --project <id> --local --name "..." --branch <branch> --agent claude --prompt "fix the build"
rox workspaces create --project <id> --local --name "..." --branch <branch> --command "bun install && bun test"
```

- `--agent`/`--prompt` launch an agent in the workspace (both required together) — the inline form of `agents create`.
- `--command <cmd>` runs a one-off shell command in the worktree — the inline form of `terminals create`.

The two are independent — pass either or both.

## Agents

```bash
rox agents list --host <id>                 # Configured agents on a host (LABEL, PRESET, COMMAND, ID)
rox agents list --local                     # Same, for this machine
rox agents create --workspace <id> --agent claude --prompt "..."
```

`--agent` accepts a preset id (e.g. `claude`, `codex`) or a HostAgentConfig instance UUID. Pass `--attachment-id <uuid>` once per attachment. Use `agents list` first if you don't already know which agents are installed on the target host.

## Terminals

```bash
rox terminals create --workspace <id> --command "bun test"   # Run a command in a new terminal
rox terminals create --workspace <id>                        # Open an interactive shell
```

`--command` is optional — omit it to open a bare shell. `--cwd <path>` overrides the working directory (defaults to the worktree).

## Tasks

```bash
rox tasks list                              # List tasks in active org
rox tasks list --priority high --assignee-me
rox tasks get <id-or-slug>
rox tasks create --title "..." [--priority high]
rox tasks update <id-or-slug> --status-id <id>
rox tasks delete <id-or-slug>
```

Filter flags: `--status`, `--priority`, `--assignee`, `--assignee-me` (`-m`), `--creator-me`, `--search` (`-s`), `--limit`, `--offset`.

## Projects

```bash
rox projects list                           # NAME, SLUG, REPO, ID
```

A project is a checked-out repo. You'll need a project ID to create workspaces or schedule automations.

## Hosts

```bash
rox hosts list                              # NAME, ONLINE, ID
```

A host is a registered machine that can run workspaces. Use `--local` on workspace commands to target this machine.

## Automations (alias: `auto`)

Automations run an agent session on a schedule. Each fire dispatches to a host and produces a workspace you (or a teammate) can open and continue interactively. Two modes:

Provide one or both of `--project` or `--workspace`. Schedules are stored as [RFC 5545 RRules](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5). Runs are dispatched at-least-once — design prompts to be idempotent. If the target host is offline at fire time, the run is marked `skipped_offline` and the next occurrence schedules normally. 
If a workspace is omitted, it will create a fresh clone of a repo for the automation to run in.

```bash
rox automations list
rox automations get <id-or-slug>
rox automations create --name "..." --rrule "FREQ=DAILY;BYHOUR=9" \
  --project <id> --agent claude --prompt-file prompt.md
rox automations create --name "..." --rrule "FREQ=WEEKLY;BYDAY=MO" \
  --workspace <id> --agent claude --prompt "Inline prompt"
rox automations update <id> --name "..."
rox automations pause <id>
rox automations resume <id>
rox automations run <id>                    # One-off run
rox automations delete <id>
rox automations logs <id> [--limit N]       # Recent runs
rox automations prompt get <id>             # Print prompt to stdout
rox automations prompt set <id> --from-file prompt.md
```

`prompt get | prompt set` round-trips byte-exact, so:

```bash
rox automations prompt get <id> > prompt.md
$EDITOR prompt.md
rox automations prompt set <id> --from-file prompt.md
```

## Common Workflows

### Run an automation and inspect the result

```bash
rox automations list --json | jq '.[] | {id, name}'
rox automations run <id> --json
rox automations get <id> --json
```

## Tips

1. **Always use `--json`** when scripting or running as an agent — `--json` output is consistent per-command.
2. **`auth whoami` before anything else** — most failures trace back to an empty `organizationId` in config or an expired token.

## Troubleshooting

- **"No active organization"**: run `rox organization list && rox organization switch <id>`.
- **"Host is offline / error connecting to host"**: the host's relay tunnel is not connected. Check to make sure both the cli and the target machine are on the latest versions of Rox.
