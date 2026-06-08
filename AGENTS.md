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
  - `apps/desktop` - Electron desktop application
  - `apps/docs` - Documentation site
  - `apps/mobile` - React Native mobile app (Expo)
- **Packages**:
  - `packages/ui` - Shared UI components (shadcn/ui + TailwindCSS v4).
    - Add components: `npx shadcn@latest add <component>` (run in `packages/ui/`)
  - `packages/db` - Drizzle ORM database schema
  - `packages/auth` - Authentication
  - `packages/trpc` - Shared tRPC definitions
  - `packages/shared` - Shared utilities
  - `packages/mcp` - MCP integration
  - `packages/local-db` - Local SQLite database
  - `packages/durable-session` - Durable session management
  - `packages/email` - Email templates/sending
  - `packages/scripts` - CLI tooling
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

### First-time VM setup (not in the update script)

Run once per fresh VM (requires Bun, Docker, Caddy, and `jq` on the PATH):

```bash
export PATH="$HOME/.bun/bin:$PATH"
./.rox/setup.local.sh
```

This provisions `.env`, starts the per-workspace Docker stack (Postgres + neon-proxy + Electric), runs migrations, and writes `.rox/ports.json`. See `DEVELOPMENT.md` for details.

**Docker on Linux cloud VMs:** Docker must be running with the `fuse-overlayfs` storage driver (see Docker install docs). Ensure the agent user can access `/var/run/docker.sock` (e.g. `docker` group).

**`db:seed-dev` caveat:** Better Auth rejects the documented `roxdev` password (6 chars; minimum is 8). If seeding fails, create the dev account via the API (`POST /api/auth/sign-up/email` with an 8+ character password) or use the web **Sign in as Local Admin (dev)** button after fixing `DEV_PASSWORD` in `packages/shared/src/dev-credentials.ts`.

### Starting services

Default ports for this workspace are in `.rox/ports.json` (typically web `3000`, API `3001`).

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun run dev                 # API + Web + Desktop + electric-proxy + Caddy
```

**Linux cloud agents:** `apps/desktop` is macOS-focused (Electron). Prefer API + Web only:

```bash
bunx turbo run dev dev:caddy --filter=@rox/api --filter=@rox/web --filter=electric-proxy --filter=//
```

Sign in at `http://localhost:3000/sign-in` (dev button or seeded credentials). Authenticated home redirects to `/agents`.

### Lint / test notes

- `bun run lint` may warn on a broken symlink at `plugins/rox/skills/rox` (optional plugin content).
- `bun test` runs ~3.8k tests; git-heavy integration tests often fail on ephemeral Linux VMs. A healthy run still reports thousands of passing tests.
