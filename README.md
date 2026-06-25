# Rox

The last developer tool you'll ever need — spawn agents, create git-worktree
workspaces, manage tasks, and schedule automations from one place. Rox ships as
a desktop app, a web app, a mobile app, and a CLI, all backed by a shared core.

- **Web:** [app.rox.one](https://app.rox.one) · **Marketing:** [rox.one](https://rox.one) · **Docs:** [docs.rox.one](https://docs.rox.one)
- **Contributing:** [CONTRIBUTING.md](./CONTRIBUTING.md) · **Local setup:** [DEVELOPMENT.md](./DEVELOPMENT.md) · **Agent guide:** [AGENTS.md](./AGENTS.md)

## Tech Stack

- **Package manager:** [Bun](https://bun.sh) `1.3.14` (no npm/yarn/pnpm) — pinned in `.bun-version`
- **Build system:** [Turborepo](https://turbo.build)
- **Database:** [Drizzle ORM](https://orm.drizzle.team) + Neon PostgreSQL (cloud) / SQLite (desktop local)
- **Live sync:** [Electric](https://electric-sql.com) + TanStack DB live queries
- **UI:** React + TailwindCSS v4 + [shadcn/ui](https://ui.shadcn.com)
- **Desktop:** Electron · **Mobile:** React Native (Expo) · **Web:** Next.js 16
- **Code quality:** [Biome](https://biomejs.dev) (format + lint at repo root) and [Sherif](https://github.com/QuiiBz/sherif) (monorepo lint)
- **Agent runtime:** mastracode / `@mastra/*`

> Next.js 16 renamed `middleware.ts` to `proxy.ts`. Never create `middleware.ts`;
> use `proxy.ts` for request interception.

## Repository Structure

Bun + Turbo monorepo. Workspaces are `apps/*`, `packages/*`, and `tooling/*`
(see root `package.json`). `workers/*` are standalone deploy targets and are not
part of the Turbo workspace.

### Apps (`apps/`)

| App | Description |
| --- | --- |
| `web` | Main web application (app.rox.one) |
| `marketing` | Marketing site (rox.one) |
| `docs` | Documentation site |
| `admin` | Admin dashboard |
| `api` | API backend (auth + tRPC) |
| `desktop` | Electron desktop application |
| `mobile` | React Native mobile app (Expo) |
| `electric-proxy` | Electric live-sync proxy |
| `relay` | Relay service |
| `streams` | Stream processing |

### Packages (`packages/`)

Shared libraries consumed across apps:

- `ui` — shared UI components (shadcn/ui + TailwindCSS v4; add with `bunx shadcn@latest add <component>` in `packages/ui/`)
- `db` — Drizzle ORM schema (Neon/PostgreSQL)
- `local-db` — local SQLite database (desktop)
- `auth` — authentication
- `trpc` — shared tRPC definitions
- `shared` — shared utilities
- `chat` — chat + slash commands
- `mcp`, `mcp-v2` — MCP integration
- `sdk` — TypeScript SDK for the Rox API
- `cli`, `cli-framework` — CLI and its framework
- `agent-bridge`, `agent-state` — agent bridge and state
- `host-provisioner`, `host-service` — host provisioning + git/worktree host service
- `workspace-client`, `workspace-fs` — workspace client + filesystem
- `workflow-core`, `workflow-runtime`, `workflow-sim-adapter` — agent pipeline workflow engine
- `runtime-clients` — runtime clients
- `panes`, `rtc`, `collab` — panes, real-time, collaboration
- `comms-core` — comms core
- `pty-daemon`, `port-scanner`, `macos-process-metrics` — terminal/process tooling
- `storage`, `email`, `analytics`, `scripts` — storage, email, analytics, CLI tooling

### Tooling (`tooling/`)

- `typescript` — shared TypeScript configs

### Workers (`workers/`, standalone)

- `email-inbound` — inbound email worker
- `transcribe-worker` — transcription worker
- `mesh-relay-watcher` — Nostr mesh relay-watcher (standalone deploy; not in the Turbo workspace)

## Getting Started

Prerequisites: Bun `1.3.14` (`curl -fsSL https://bun.sh/install | bash`). No Neon
or third-party credentials are required for local development — the local setup
script runs the full data stack in Docker. See [DEVELOPMENT.md](./DEVELOPMENT.md)
for the complete guide.

```bash
bun install            # install all workspace dependencies
./.rox/setup.local.sh  # .env, Docker Postgres + neon-proxy + Electric, migrate, seed
bun run dev            # API + Web + Desktop + electric-proxy + Caddy
```

Dev sign-in: **Sign in as Local Admin (dev)**, or `admin@local.test` / `roxdev12`.

## Common Commands

```bash
# Development
bun dev                    # Start the default dev servers (API + Web + Desktop + electric-proxy + Caddy)
bun run dev:all            # Start every dev server
bun run dev:docs           # Docs only
bun run dev:marketing      # Marketing + docs

# Build
bun run build              # Build the desktop app (turbo --filter=@rox/desktop)

# Tests
bun test                   # Run all workspace tests (turbo)

# Code quality
bun run lint               # Lint (Biome, treated strictly — warnings fail)
bun run lint:fix           # Auto-fix lint + format issues
bun run format             # Format only
bun run format:check       # Check formatting only (CI)
bun run typecheck          # Type-check all packages

# Database (Drizzle)
bun run db:generate:desktop  # Generate local-db (SQLite) migrations — offline
bun run db:push              # Push schema (non-production only)
bun run db:migrate           # Apply migrations (deploy step)
bun run db:seed-dev          # Seed the local dev user

# Maintenance
bun run clean              # Clean root node_modules
bun run clean:workspaces   # Clean all workspace node_modules
```

Per-app and per-package commands are exposed through their own `package.json`
`scripts` and run via Turbo filters, e.g. `bunx turbo run test --filter=@rox/sdk`.

## Database

- Schema lives in `packages/db/src/` (cloud) and `packages/local-db/` (desktop SQLite).
- Use Drizzle ORM for all database access.
- Agents may edit the schema and run `bunx drizzle-kit generate` — `generate` is
  offline (schema-vs-snapshot diff) and touches no database.
- Never run `drizzle-kit migrate`/`push` against production without explicit
  confirmation. Never hand-edit files in `packages/db/drizzle/`.

## Code Quality & Verification

Biome runs at the repo root (not per package) for speed:

- `biome check --write` — format + lint + organize imports + fix auto-fixable issues
- `biome check` — check only (no changes)
- `biome format` — format only

CI fails on **any** Biome diagnostic (warnings are treated as errors). Run
`bun run lint:fix`, then confirm `bun run lint` exits 0 before pushing. In
non-interactive shells, redirect stdin so the git-check helpers don't block:
`bun run lint < /dev/null`.

The CI pipeline (`.github/workflows/ci.yml`) runs: **Sherif**, **Dependency
Audit**, **Lint**, **Test**, **Typecheck**, **Build (desktop)**, and **Build
CLI** (Linux x64, macOS arm64, Linux arm64).

## License

MIT.
