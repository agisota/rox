# Rox Monorepo Guide

You're running inside a Rox workspace — an isolated git-worktree copy of this repo. "Workspace" in any user message refers to this, not VS Code/editor workspaces.

## Question Tool

When you need to ask the user ANY question — including simple yes/no, confirmations, and clarifications — ALWAYS use the `ask_user` tool. Never ask questions in plain text. The Rox UI renders `ask_user` calls as an interactive overlay with clickable option buttons; plain-text questions will not be surfaced to the user in the same way.

Guidelines for agents and developers working in this repository.

## Structure

Bun + Turbo monorepo with:
- **Apps**:
  - `apps/web` - Main web application (app.rox.one)
  - `apps/marketing` - Marketing site (rox.one)
  - `apps/admin` - Admin dashboard
  - `apps/api` - API backend
  - `apps/desktop` - Electron desktop application ("The last developer tool you'll ever need")
  - `apps/docs` - Documentation site
  - `apps/mobile` - React Native mobile app (Expo)
  - `apps/electric-proxy` - Electric live-sync proxy
  - `apps/relay` - Relay service
  - `apps/streams` - Stream processing
- **Packages**:
  - `packages/ui` - Shared UI components (shadcn/ui + TailwindCSS v4).
    - Add components: `npx shadcn@latest add <component>` (run in `packages/ui/`)
  - `packages/db` - Drizzle ORM database schema
  - `packages/auth` - Authentication
  - `packages/trpc` - Shared tRPC definitions
  - `packages/shared` - Shared utilities
  - `packages/mcp` - MCP integration
  - `packages/local-db` - Local SQLite database
  - `packages/email` - Email templates/sending
  - `packages/scripts` - CLI tooling
  - `packages/agent-bridge` - Agent bridge
  - `packages/agent-state` - Agent state
  - `packages/analytics` - Analytics
  - `packages/chat` - Chat + slash commands
  - `packages/cli` - CLI
  - `packages/cli-framework` - CLI framework
  - `packages/collab` - Collaboration
  - `packages/comms-core` - Comms core
  - `packages/host-provisioner` - Host provisioner
  - `packages/host-service` - Host service (git/worktree)
  - `packages/macos-process-metrics` - macOS process metrics
  - `packages/mcp-v2` - MCP v2
  - `packages/panes` - Panes
  - `packages/port-scanner` - Port scanner
  - `packages/pty-daemon` - PTY daemon
  - `packages/rtc` - RTC
  - `packages/runtime-clients` - Runtime clients
  - `packages/sdk` - TypeScript SDK for the Rox API
  - `packages/storage` - Storage
  - `packages/workflow-core` - Workflow core
  - `packages/workflow-runtime` - Workflow runtime
  - `packages/workflow-sim-adapter` - Workflow sim adapter
  - `packages/workspace-client` - Workspace client
  - `packages/workspace-fs` - Workspace FS
- **Tooling**:
  - `tooling/typescript` - Shared TypeScript configs

## Tech Stack

- **Package Manager**: Bun (no npm/yarn/pnpm)
- **Build System**: Turborepo
- **Database**: Drizzle ORM + Neon PostgreSQL
- **UI**: React + TailwindCSS v4 + shadcn/ui
- **Code Quality**: Biome (formatting + linting at root)
- **Next.js**: Version 16 - NEVER create `middleware.ts`. Next.js 16 renamed middleware to `proxy.ts`. Always use `proxy.ts` for request interception.

## Common Commands

```bash
# Development
bun dev                    # Start all dev servers
bun test                   # Run tests
bun build                  # Build all packages

# Code Quality
bun run lint               # Check for lint issues (no changes)
bun run lint:fix           # Fix auto-fixable lint issues
bun run format             # Format code only
bun run format:check       # Check formatting only (CI)
bun run typecheck          # Type check all packages

# Maintenance
bun run clean              # Clean root node_modules
bun run clean:workspaces   # Clean all workspace node_modules
```

## Code Quality

**Biome runs at root level** (not per-package) for speed:
- `biome check --write --unsafe` = format + lint + organize imports + fix all auto-fixable issues
- `biome check` = check only (no changes)
- `biome format` = format only
- Use `bun run lint:fix` to fix all issues automatically

## Agent Rules
1. **Type safety** - avoid `any` unless necessary
2. **Prefer `gh` CLI** - when performing git operations (PRs, issues, checkout, etc.), prefer the GitHub CLI (`gh`) over raw `git` commands where possible
3. **Shared command and skill source** - keep command definitions in `.agents/commands/` and skill definitions in `.agents/skills/`. `.claude/commands` and `.cursor/commands` should be symlinks to `../.agents/commands`; `.claude/skills` should be a symlink to `../.agents/skills`. (`packages/chat` discovers slash commands from `.claude/commands`.) Skills aren't a cross-agent format yet, so non-Claude agents (Codex, Cursor, OpenCode) should read the relevant `.agents/skills/*/SKILL.md` file directly when its description matches the task.
4. **Workspace MCP config** - keep shared MCP servers in `.mcp.json`; `.cursor/mcp.json` should link to `../.mcp.json`. Codex uses `.codex/config.toml` (run with `CODEX_HOME=.codex codex ...`). OpenCode uses `opencode.json` and should mirror the same MCP set using OpenCode's `remote`/`local` schema.
5. **Mastra dependencies** - use the published upstream `mastracode` and `@mastra/*` packages. Do not add fork tarball overrides or custom patch steps unless explicitly requested.
6. **Plan & doc placement** - implementation plans go in `plans/` (cross-cutting) or `apps/<app>/plans/` (app-scoped); shipped plans move to `plans/done/`. Architecture/reference docs go in `<app>/docs/`. Never drop `*_PLAN.md` at an app root or inside `src/`.
7. **Always fix lint warnings before pushing** - CI fails on Biome warnings, not just errors (the lint script treats warnings as errors). Run `bun run lint:fix` after edits and verify `bun run lint` exits 0 before `git push`. Never push code that produces lint output, even auto-fixable formatting.
8. **Linear ticket format** - all tickets (creation, drafting, grooming) follow `.agents/skills/ticket-format/SKILL.md`. Read that file before creating or grooming a ticket.
9. **TanStack DB / Electric live queries are cache-first** - `useLiveQuery` can return persisted rows in `data` while the collection is still not `isReady`. Always render existing rows first. Use `isReady` only to decide what to show when no row/data exists yet: no data + not ready = loading/skeleton/null; no data + ready = empty/not-found. Never hide, blank, or replace existing `data` just because `isReady` is false or `isLoading` is true. This cache-first rendering rule does not apply to write/seeding side effects: wait for strict readiness before deriving missing rows or writing defaults, unless the write is provably idempotent.


---

## Project Structure

All projects in this repo should be structured like this:

```
app/
├── page.tsx
├── dashboard/
│   ├── page.tsx
│   ├── components/
│   │   └── MetricsChart/
│   │       ├── MetricsChart.tsx
│   │       ├── MetricsChart.test.tsx      # Tests co-located
│   │       ├── index.ts
│   │       └── constants.ts
│   ├── hooks/                             # Hooks used only in dashboard
│   │   └── useMetrics/
│   │       ├── useMetrics.ts
│   │       ├── useMetrics.test.ts
│   │       └── index.ts
│   ├── utils/                             # Utils used only in dashboard
│   │   └── formatData/
│   │       ├── formatData.ts
│   │       ├── formatData.test.ts
│   │       └── index.ts
│   ├── stores/                            # Stores used only in dashboard
│   │   └── dashboardStore/
│   │       ├── dashboardStore.ts
│   │       └── index.ts
│   └── providers/                         # Providers for dashboard context
│       └── DashboardProvider/
│           ├── DashboardProvider.tsx
│           └── index.ts
└── components/
    ├── Sidebar/
    │   ├── Sidebar.tsx
    │   ├── Sidebar.test.tsx               # Tests co-located
    │   ├── index.ts
    │   ├── components/                    # Used 2+ times IN Sidebar
    │   │   └── SidebarButton/             # Shared by SidebarNav + SidebarFooter
    │   │       ├── SidebarButton.tsx
    │   │       ├── SidebarButton.test.tsx
    │   │       └── index.ts
    │   ├── SidebarNav/
    │   │   ├── SidebarNav.tsx
    │   │   └── index.ts
    │   └── SidebarFooter/
    │       ├── SidebarFooter.tsx
    │       └── index.ts
    └── HeroSection/
        ├── HeroSection.tsx
        ├── HeroSection.test.tsx           # Tests co-located
        ├── index.ts
        └── components/                    # Used ONLY by HeroSection
            └── HeroCanvas/
                ├── HeroCanvas.tsx
                ├── HeroCanvas.test.tsx
                ├── HeroCanvas.stories.tsx
                ├── index.ts
                └── config.ts

components/                                # Used in 2+ pages (last resort)
└── Header/
```

1. **One folder per component**: `ComponentName/ComponentName.tsx` + `index.ts` for barrel export
2. **Co-locate by usage**: If used once, nest under parent's `components/`. If used 2+ times, promote to **highest shared parent's** `components/` (or `components/` as last resort)
3. **One component per file**: No multi-component files
4. **Co-locate dependencies**: Utils, hooks, constants, config, tests, stories live next to the file using them

### Exception: shadcn/ui Components

The `src/components/ui/` and `src/components/ai-elements` directories contain shadcn/ui components. These use **kebab-case single files** (e.g., `button.tsx`, `base-node.tsx`) instead of the folder structure above. This is intentional—shadcn CLI expects this format for updates via `bunx shadcn@latest add`.

## Database Rules

** IMPORTANT ** - Never touch the production database unless explicitly asked to. Even then, confirm with the user first.

- Schema in `packages/db/src/`
- Use Drizzle ORM for all database operations

## DB migrations
- Agents MAY change the Drizzle schema in `packages/db/src/schema/` and run `bunx drizzle-kit generate --name="<sample_name_snake_case>"` to author migration SQL — `generate` is offline (schema-vs-snapshot diff) and does not touch any database.
- Agents MUST NOT run `drizzle-kit migrate`/`push` (or otherwise apply migrations) against the production database without explicit confirmation. Applying migrations is a deploy step.
- For local testing of an applied migration, spin up a new neon branch and point root `.env` at it; never point at production.
- `NEON_ORG_ID` and `NEON_PROJECT_ID` env vars are set in .env
- list_projects tool requires org_id passed in
- **NEVER manually edit files in `packages/db/drizzle/`** - this includes `.sql` migration files, `meta/_journal.json`, and snapshot files. These are auto-generated by Drizzle. If you need to create a migration, only modify the schema files in `packages/db/src/schema/` and ask the user to run `drizzle-kit generate`.

## Cursor Cloud specific instructions

Linux cloud VMs are supported for **web + API** development; desktop Electron is best-effort (no display by default).

### First-time / fresh VM

Prereqs (not in the update script): Bun 1.3.11 (`curl -fsSL https://bun.sh/install | bash`), Docker CE with `fuse-overlayfs` storage driver + `iptables-legacy`, Caddy, `jq`. Start `dockerd` if the socket is missing; add the user to the `docker` group or `chmod` the socket.

```bash
export PATH="$HOME/.bun/bin:$PATH"
./.rox/setup.local.sh   # .env, Docker Postgres+neon-proxy+Electric, migrate, seed
bun run dev             # API + Web + Desktop + electric-proxy + Caddy
```

On a **headless** cloud VM, do NOT use `bun run dev` — it includes `--filter=@rox/desktop`, and when Electron fails to launch (no display, "Electron uninstall") turbo treats it as a failed task and tears down ALL the other dev servers (web/api/electric-proxy/caddy) too. Run the desktop-excluded set instead:

```bash
bunx turbo run dev dev:caddy --filter=@rox/api --filter=@rox/web --filter=electric-proxy --filter=//
```

See `DEVELOPMENT.md` for full details. Dev sign-in: **Sign in as Local Admin (dev)** or `admin@local.test` / `roxdev12`.

### Services (default `bun run dev`)

| Service | Port source | Notes |
|:--------|:------------|:------|
| Web | `WEB_PORT` in `.env` (base 3000) | Primary UI for cloud demos |
| API | `API_PORT` (+1) | Auth + tRPC |
| Postgres | `LOCAL_PG_PORT` (+14) | Docker |
| neon-proxy | `LOCAL_NEON_PROXY_PORT` (+15) | HTTP SQL proxy for Drizzle |
| Electric | `ELECTRIC_PORT` (+9) | Live sync |
| Caddy + Wrangler | `CADDY_ELECTRIC_PORT`, `WRANGLER_PORT` | HTTPS Electric SSE |

Use `tmux` for long-running `bun run dev` sessions.

### Tailscale serve (remote access on tailnet)

```bash
export TS_AUTHKEY=tskey-auth-...   # or interactive `tailscale up`
./.rox/tailscale-serve.sh
./.rox/restart-dev.sh              # stop old servers + restart with new .env URLs
```

| Tailscale HTTPS | Local target |
|:----------------|:-------------|
| `:443` | Web (`WEB_PORT`) |
| `:8443` | API (`API_PORT`) |
| `:8444` | Caddy Electric (`CADDY_ELECTRIC_PORT`) |

Writes `NEXT_PUBLIC_*` URLs + `.rox/tailscale-urls.json`. Cloud VMs: userspace `tailscaled` (see script header). Undo: `sudo tailscale serve reset`.


### Troubleshooting

- **neon-proxy timeouts after idle** — restart the stack: `docker compose -p rox-workspace -f docker-compose.yml down && docker compose -p rox-workspace -f docker-compose.yml up -d` (export `LOCAL_PG_PORT` / `LOCAL_NEON_PROXY_PORT` / `LOCAL_ELECTRIC_PORT` from `.env` first). If `DOCKER-ISOLATION-STAGE-2` iptables errors appear, restart `dockerd`.
- **Stale dev user / wrong password** — delete `admin@local.test` from `auth.users` and re-run `NODE_ENV=development bun run db:seed-dev`, or re-run `./.rox/setup.local.sh`.
- **Tailscale serve** — requires logged-in tailnet (`TS_AUTHKEY` or browser login via `tailscale up`). Restart `bun run dev` after URL changes.
- **Lint hangs in non-interactive shells** — `scripts/lint.sh`'s git-check scripts call `rg` with no path argument, so when stdin is a non-TTY pipe (background jobs, CI-style runs) `rg` blocks reading stdin forever (biome itself finishes in seconds). Run lint with stdin redirected: `bun run lint < /dev/null`.
- **Lint** — `plugins/rox/skills/rox` must symlink to `skills/rox` (not `skills/superset`).
- **Web 500 / `Module not found` for `framer-motion` internal `.mjs`** — symptom of a partially-extracted bun cache (the `.mjs.map` files exist but the `.mjs` siblings are missing). Fix with a clean re-extract: `bun pm cache rm && rm -rf node_modules/.bun/framer-motion@* && bun install --force`.
- **Tests** — full `bun test` includes git/worktree integration suites (`packages/host-service`, etc.) that may fail in minimal VMs. Smoke: `bun test packages/shared packages/auth`.
