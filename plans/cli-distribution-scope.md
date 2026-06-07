# CLI Distribution Scope

This document defines the scope for shipping the first distributable Rox
CLI. The current-state reference in `packages/cli/CLI_SPEC_CURRENT.md` is the
source-derived inventory of current behavior. The target v1 contract should live
in `packages/cli/CLI_SPEC_TARGET.md`. This plan defines what we will change
before we call the CLI shippable.

## Goal

Ship a small, reliable CLI that users can install and use for authenticated
cloud workflows plus local host-service lifecycle management.

The v1 CLI should be boring to operate:

- commands shown in help should work
- command options should either affect behavior or not exist
- JSON output should be stable enough for scripts and agents
- install artifacts should include the CLI and required host-service runtime
- docs should not advertise missing command groups

## V1 Command Scope

### In Scope

These commands should be implemented, tested, and documented for v1:

```text
rox auth login
rox auth logout
rox auth status

rox organization list
rox organization switch <idOrSlug>

rox tasks list
rox tasks get <idOrSlug>
rox tasks create
rox tasks update <idOrSlug>
rox tasks delete <idOrSlug...>

// Can we validate that it's ergonomic for an agent to read and update the markdown content for an automation? it'll be a common action probably
rox automations list
rox automations get <id>
rox automations create
rox automations update <id>
rox automations delete <id>
rox automations pause <id>
rox automations resume <id>
rox automations run <id>
rox automations logs <id>

rox host start
rox host status
rox host stop
```

### Explicitly Out Of Scope For V1

These surfaces should not appear as usable CLI commands or be advertised in
public docs for v1:

// Devices / workspaces / projects probably should be brought into scope, esp workspaces
```text
rox devices ...
rox workspaces ...
rox projects ...
rox agent ...
rox ui ...
rox chat ...
rox notifications ...
rox ports ...
```

`devices` and `workspaces` currently exist as stubs. For v1, either hide them
from help or keep them clearly marked experimental/internal. The default should
be hiding them until device command routing exists.

## Required Fixes Before Shipping

### Auth

// Should be auth status
- Decide whether `auth check` is the final command name or add `auth whoami` as
  an alias.
  // Should remove --api-url probably, can just rebuild with differnt env vars
- Make `auth login --api-url` the only documented API URL override unless a
  global `--api-url` is implemented.
// Non-tty login behavior? may need help undertanding this
- Confirm non-TTY login behavior is acceptable when a user belongs to multiple
  organizations. Today the CLI does not select an org in that case.

### Tasks

- Make `tasks get`, `tasks update`, and `tasks delete` actually support both
  UUID and slug, or change help/docs to slug-only.
- Make `tasks list` filters work or remove the ignored options:
  `--status`, `--priority`, `--assignee-me`, `--creator-me`, `--search`,
  `--limit`, and `--offset`.
  // What is --branch?
- Decide whether `tasks create --branch` is supported. Today the option is
  accepted and ignored.
- Add tests that prove task list filtering and task lookup behavior.

### Automations

- Implement `rox automations logs <id>` using `automation.listRuns`, or
  remove every reference to logs from docs and comments. Recommended: implement
  it, because the API already exists.
- Fix `automations update` so omitting `--device` does not clear
  `targetHostId`.
  // For creating resources, what is the correct way in the cli? is -- the correct way?
- Decide whether `automations create --workspace` still requires `--project`.
  Today it does. If that is intentional, keep it documented and validate the
  error clearly.
- Mark `--project` as required in parser help if it remains required at
  runtime.
- Add tests for create/update payloads, especially target host preservation.

### Host Service

- Ensure distribution artifacts include a working `rox-host` sibling
  binary and host migrations folder.
- Decide whether `host install` ships in v1. If not, hide or remove the stub.
- Verify `host start --daemon`, `host status`, and `host stop` work from an
  installed binary, not only from source.

### Stubbed Commands

- Hide or remove `devices list` until an API list endpoint exists.
- Hide or remove `workspaces list/create/delete` until device command routing
  exists.
- Public docs should not mention device/workspace CLI control until those
  paths are real.

### CLI Framework And UX

- Show inherited global options in command help, or document that command help
  only shows leaf options.
- Label required options in help output.
- Decide the stable JSON convention:
  - current behavior: print raw data payload
  - alternative: always print `{ "data": ... }` / `{ "success": true }`
- Keep `--quiet` behavior intentionally narrow: IDs for arrays/objects with
  `id`, JSON fallback otherwise.

## Distribution Requirements

### Artifacts

V1 should produce at least:

```text
rox-darwin-arm64
rox-linux-x64
```

Before calling the CLI distributable, verify whether we also need:

```text
rox-darwin-x64
rox-linux-arm64
```

The distribution archive must include:

- `rox` CLI binary
- `rox-host` host-service binary
- host-service migrations under the path expected by the CLI
- install script or documented manual install steps
- version metadata matching the release

### Install Flow

The install flow should support:

- fresh install
- overwrite existing binary
- uninstall or manual cleanup instructions
- shell PATH instructions
- clear failure messages for unsupported OS/architecture

### Configuration

Document exactly where the CLI writes local state:

```text
~/rox/config.json
~/rox/device.json
~/rox/host/<organizationId>/manifest.json
~/rox/host/<organizationId>/host.db
```

If we want `~/.rox` instead, change code before shipping. Do not document
both as valid unless both are intentionally supported.

## Acceptance Checks

Run these from a clean machine or clean local CLI home directory before release:

```bash
rox --help
rox auth login
rox auth check
rox organization list
rox tasks list --limit 5
rox tasks create --title "CLI smoke test" --priority low
rox tasks get <created-slug-or-id>
rox tasks update <created-slug-or-id> --priority medium
rox tasks delete <created-slug-or-id>
rox automations list
rox automations create --name "CLI smoke automation" --rrule "FREQ=DAILY;BYHOUR=9;BYMINUTE=0" --project <projectId> --prompt "Say hello"
rox automations get <automation-id>
rox automations pause <automation-id>
rox automations resume <automation-id>
rox automations logs <automation-id>
rox automations delete <automation-id>
rox host start --daemon
rox host status
rox host stop
```

Run JSON checks for scriptability:

```bash
rox auth check --json
rox organization list --json
rox tasks list --json
rox automations list --json
rox host status --json
```

Run quiet checks where IDs are expected:

```bash
rox organization list --quiet
rox tasks list --quiet
rox automations list --quiet
```

## Release Gate

The CLI is shippable when:

- all in-scope commands work from installed binaries
- all in-scope commands have accurate help text
- ignored options are removed or implemented
- stubbed commands are hidden or removed
- public docs only show shippable commands
- install artifacts include everything required by `host start`
- acceptance checks pass against staging and production configuration

## Deferred Backlog

These are good follow-up areas after v1:

- device list and host selection UX
- workspace creation and lifecycle via host-service command routing
- project listing and setup
- terminal/browser/chat pane control
- port listing and browser handoff
- notifications and human approval flows
- richer automation run state and completion tracking
