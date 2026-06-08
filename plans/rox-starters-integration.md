# Rox Starters — integration plan

## Context

"Rox Starters" is Rox's branded integration of the **Open Mercato** AI-engineering
foundation (Next.js/TS, MikroORM, multi-tenant, RBAC, modules for CRM/ERP/commerce,
events/workflows). Internally we call it **rox-starters**. The goal is NOT to merge
Open Mercato's codebase into Rox — they are different runtimes (Rox = Electron agent
cockpit; Open Mercato = a business-app framework). Instead, Rox treats rox-starters as
a **first-class supported project type**: Rox creates, sets up, validates, and drives
agent development of rox-starters apps.

This file is the living plan. v1 is shipped; the rest are sequenced follow-ups.

## Verified extension points (from code, not assumption)

- **Project templates (creation):**
  - UI cards: `apps/desktop/src/renderer/.../new-project/components/TemplateTab/TemplateTab.tsx`
    (each card clones `repo` via `electronTrpc.projects.cloneRepo`).
  - Host-service registry (by id): `packages/host-service/src/trpc/router/project/utils/templates.ts`.
- **Workspace setup/validation (already exists):** projects declare `{setup, teardown, run}`
  in **`.rox/config.json`** (3-tier: user override > worktree > main repo; `.rox/config.local.json`
  overlay). Core: `apps/desktop/src/lib/trpc/routers/workspaces/utils/setup.ts`
  (`detectSetupDefaults()`), `apps/desktop/src/shared/workspace-run-definition.ts`.
- **Agent rules/context:** injected via `contextPromptTemplateSystem` in
  `apps/desktop/src/shared/context/buildLaunchSpec.ts`; recommended channel is a
  project `.rox/agents.json` loaded in `packages/shared/src/agent-settings.ts`.

## v1 — SHIPPED

**"Rox Starters" template card.** Users can create a rox-starters project from
Create Project → Template. Branded `rox-starters`, points at `agisota/open-mercato`.
- `TemplateTab.tsx` — "Rox Starters" card (LuStore, amber).
- `templates.ts` — `rox-starters` registry entry.

## Next slices (sequenced)

1. **Auto setup + validation defaults.** Extend `detectSetupDefaults()` to recognize an
   Open Mercato project (package.json has `@open-mercato/*`, or `.ai/specs/` dir) and
   default its `.rox/config.json` to:
   - setup: `corepack enable`, `yarn install`, `docker compose up -d`, `yarn generate`
   - run/validate: `yarn generate`, `yarn typecheck`, `yarn lint`, `yarn test`, `yarn build:app`
   Touch: `setup.ts` detection + the config resolution.
2. **Agent rules pack.** Ship a rox-starters agent ruleset (module system, tenant/org
   scoping, RBAC, spec-first `.ai/specs`, test discipline) injected via `.rox/agents.json` /
   `contextPromptTemplateSystem` when the project is detected as rox-starters.
3. **Dedicated branded template repo.** Create `agisota/rox-starters` as a standalone-app
   scaffold (from `create-mercato-app`) and deep-rename internal `open-mercato` → `rox-starters`;
   point the template at it. (Fork-in-place is blocked because one account can't own parent+fork.)
4. **Business-app surfaces (large, separate epics):** "Create Business App" flow, Modules
   list, Entity/Form/Workflow builders, live admin Preview — each its own spec.

## Verification

- v1: `apps/desktop` + `@rox/host-service` typecheck; Biome clean. The card renders in
  Create Project → Template and clones the framework into the chosen directory.
- Full runtime (cloning + `yarn setup` + docker) is validated once slice 1 lands and a
  rox-starters project is actually created on a host with Docker/Yarn.
