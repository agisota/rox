# MONAD port: composites + `/monad` gallery (PR-02), then product-surface bindings (PR-03..14)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows the conventions in the root `AGENTS.md` and `apps/desktop/AGENTS.md`, and the ExecPlan template. Key repo conventions used below: Bun (never npm/yarn/pnpm); Biome for lint/format at the repo root; folder-per-component with an `index.ts` barrel and named exports; tabs for indentation; bare `renderer/...` import alias (maps to `apps/desktop/src/renderer/*`); tests co-located as `*.test.ts(x)` and run with `bun test`.


## Purpose / Big Picture

MONAD is the motion + design-system library being ported into the Rox desktop renderer (`apps/desktop/src/renderer/monad`). Its job is to give the app one coherent visual language for *agentic state*: graphite means "at rest", orange (`--monad-transition`) means "in flight", green (`--monad-verified`) means "done/verified", with restrained, accessibility-aware motion.

Two layers already exist and are shipped on branch `claude/eager-meitner-K6A5C` (PR #40): the **foundation** (motion tokens, the `useMotionPreference` hook, the `MonadThemeProvider`/`FontProvider`/`FontSwitcher` providers, and scoped CSS tokens) and the **primitives** (nine import-ready components: `StateNode`, `TransitionEdge`, `EventParticle`, `RuntimeFrame`, `MonadCapsule`, `TraceStream`, `ValidatorGate`, `TargetAttractor`, `DeltaField`). One real product surface — the V2 workspace run button — has already been bound to MONAD motion.

What no one can do today: **see** all of MONAD in one place and confirm it looks and animates correctly. The primitives compile and pass unit tests, but nothing renders them together, and — critically — the Electron app cannot be launched in this remote execution environment (the native module rebuild fails with HTTP 403 fetching Electron headers), so there has been **zero visual verification** of any MONAD motion so far.

After this plan's first milestone, a developer running the app locally can open a single route, `/monad`, and see every primitive in its resting state and toggle it into its active/animated state, switch the three font themes, flip dark/light, and switch the motion preference between `full`/`essential`/`off` to confirm reduced-motion behavior — all without touching real product data. That gallery becomes the **instrument** that makes the remaining product-surface bindings (PR-03..14) verifiable: each binding is signed off by comparing the real surface against the gallery on a local build.

The end state ("the result") is MONAD's visual language live across the real desktop surfaces: workspace tabs, the agent tool-call lifecycle, diff/changes headers, the review/CI gate, the runtime frame around runs, task/goal completion, and the Settings controls for font + motion. This plan delivers the gallery in full detail and lays out the binding roadmap that follows it.


## Assumptions

These are working assumptions that unblock planning. Each must be confirmed (moved to the Decision Log) or removed before the plan is considered complete.

1. The `/monad` gallery is a **developer/design reference surface**, acceptable to ship in the bundle (it is static, reads no product data, and is reachable only by explicit navigation). It does not need to sit behind the authentication guard. (See Open Question 1.)

2. The precise mapping of primitives to product surfaces for PR-03..14 below is reconstructed from the route tree and the existing primitive set; it should be reconciled against the original MONAD PORT BRIEF before each binding is implemented. The gallery milestone (PR-02) does **not** depend on this mapping. (See Open Question 2.)

3. Visual correctness can only be fully verified by a human on a local build (`bun --cwd apps/desktop dev`). In this remote environment we can verify only that routes generate, types pass, lint passes, and render-smoke tests pass. The plan treats the human visual pass as an explicit, separate acceptance gate. (See Open Question 3.)

4. No new third-party dependencies are required for the gallery. The optional `@fontsource` font packages named in `monad/README.md` are *not* required — the font stacks degrade to bundled/system fonts, so font switching is observable without them.


## Open Questions

1. ~~**Gallery placement / gating**~~ — RESOLVED (see Decision Log "Gallery route gating"): ship `/monad` always-available to everyone, labelled "preview · alpha", with a deliberately hard-to-find corner entry point.

2. **PR-03..14 surface mapping** — Does the reconstructed primitive→surface map below match the original PORT BRIEF's PR numbering and scope? Impacted sections: Plan of Work (Milestones M5+), Progress. Placeholder: Decision Log entry "Binding roadmap reconciliation".

3. ~~**Automated visual proxy depth**~~ — RESOLVED (see Decision Log "Render-smoke test depth"): the repo has no React/jsdom test harness, so no render-smoke test was added; typecheck + lint are the automated gate and the human/local pass is the visual gate.

4. ~~**Branch/PR for PR-02**~~ — RESOLVED (see Decision Log "Branch/PR strategy for PR-02"): land on the existing branch `claude/eager-meitner-K6A5C` (PR #40), keep draft. (Whether to later flip #40 to "ready for review" remains the user's call.)


## Progress

- [x] (2026-06-07) PR-00 foundation shipped (`9314fef`, review fixes `51c6cf1`): motion tokens, `useMotionPreference`, providers, scoped `tokens.css`.
- [x] (2026-06-07) PR-01 primitives shipped (`1ab50c5`): nine primitives + `status.ts` + barrels.
- [x] (2026-06-07) PR-12 run-button binding shipped (`2323475`) + reduced-motion fix (`7a39e82`, CodeRabbit "LGTM").
- [x] (2026-06-07) CI blockers fixed (`988c976`): sherif dependency order + broken `plugins/rox/skills/rox` symlink.
- [x] (2026-06-09) Discovery for this plan: confirmed routing config (`apps/desktop/tsr.config.json`), example route shape (`routes/sign-in/page.tsx`), provider/primitive prop signatures, and that `tokens.css` is imported only by `MonadThemeProvider` (no global leak).
- [x] (2026-06-09) M1 — Gallery route scaffold: `routes/monad/page.tsx` → `createFileRoute("/monad/")`, `MonadGallery` shell wrapped in `MonadThemeProvider`→`FontProvider`; discreet always-available entry point added as a faint corner `α` link on Settings → Account.
- [x] (2026-06-09) M2 — Primitives showcase: all nine primitives in `PrimitivesSection`, each with a resting card and an idle→active toggle.
- [x] (2026-06-09) M3 — Composites: `CompositesSection` with a four-step tool-call lifecycle (context → execute → validate → done) and an S0→S\* state-transition row with `DeltaField`.
- [x] (2026-06-09) M4 — Gallery controls (font / appearance / motion-preference, in `GalleryControls`) + bonus `FoundationSection` (the PR-00 motion helpers). No render-smoke tests added — repo has no React/jsdom test harness (see Decision Log "Render-smoke test depth"); automated gate is typecheck + lint, visual pass is human/local.
- [~] M5+ — Product-surface bindings PR-03..14 (one milestone per surface; see roadmap). (completed: PR-12 run button, PR-13 Settings motion preference; remaining: PR-03..11, PR-14)
  - [x] (2026-06-09) PR-13 — Settings → Appearance "Motion" section (Full/Reduced/Off) backed by `useMotionPreference().setPreference`; new `APPEARANCE_MOTION` settings-search item. Font switcher deferred (MONAD font has near-zero product effect until more surfaces bind). typecheck 0, lint 0, settings-search tests 7/7. Commit `56f85e0`.

Phase A (the `/monad` gallery, PR-02) is complete and green: `bun run --cwd apps/desktop typecheck` exit 0, `bun run lint` exit 0 (4736 files), `bunx sherif` clean, existing `bun test` 4/4. Awaiting the human visual pass (Layer 2) on a local build.


## Surprises & Discoveries

- Observation: `tokens.css` is imported exactly once, by `MonadThemeProvider`, and every rule is scoped under `[data-monad-root]`. So loading the gallery (which mounts that provider) cannot restyle the product shell.
  Evidence: `grep` for `tokens.css` returns only `MonadThemeProvider/MonadThemeProvider.tsx:9: import "../../tokens.css";`; `tokens.css` rules are all under `[data-monad-root]`, and the `:root` font-stack vars are inert until a `[data-monad-root]` consumes `--monad-font`.

- Observation: TanStack Router here uses custom file tokens — routes are `page.tsx`, layouts are `layout.tsx`, and **all other `.tsx` files in a route folder are ignored** by the route generator, so gallery components can be co-located under `routes/monad/components/` without becoming routes.
  Evidence: `apps/desktop/tsr.config.json` sets `"indexToken": "page"`, `"routeToken": "layout"`, and `"routeFileIgnorePattern": "^(?!(__root|page|layout)\\.tsx$).*\\.(tsx?|jsx?)$"`.

- Observation: The gallery wrapper must not set its own background — `[data-monad-root]` already paints `background-color: var(--monad-bg)` and `.monad-blueprint` layers the grid + vignette on top. Setting a solid background on the inner wrapper would have hidden the blueprint grid. The wrapper therefore only does layout (`p-8`, scroll) and inherits bg/text/font from the root.
  Evidence: `tokens.css` — `[data-monad-root] { … background-color: var(--monad-bg); color: var(--monad-text); font-family: var(--monad-font, …) }` and the `.monad-blueprint` `background-image` grid.

- Observation: The desktop package has no React render-test harness. `bun test` preloads `xterm-env-polyfill.ts` + `test-setup.ts` (terminal-focused) with no jsdom/happy-dom and no `@testing-library/*` dependency, so component render tests are not currently possible without standing one up.
  Evidence: `apps/desktop/bunfig.toml` `[test] preload = [...]`; no testing-library match in `package.json`.


## Decision Log

- Decision: Build the `/monad` gallery (PR-02) **before** any further product binding.
  Rationale: The Electron app cannot launch in this environment, so there is no way to visually verify motion here. The gallery is the one surface that lets a human on a local build eyeball all states at once; it de-risks every subsequent binding by giving a reference to compare against.
  Date/Author: 2026-06-09, Claude (planning).

- Decision: Place the gallery at top-level route `/monad` (folder `routes/monad/`), outside `_authenticated`.
  Rationale: It reads no product data and needs to be reachable even before/without sign-in for QA. Mirrors the existing top-level `routes/create-organization/` and `routes/sign-in/` routes. (Confirm gating in Open Question 1.)
  Date/Author: 2026-06-09, Claude (planning).

- Decision: Add a **dev-only** link to `/monad` on the sign-in page, guarded by `env.NODE_ENV === "development"`.
  Rationale: Electron windows have no address bar; the most novice-proof way to reach the route on a local build is an in-app link. The sign-in page is the first screen and already uses the exact `env.NODE_ENV === "development"` guard for its dev login button, so the affordance never ships to users.
  Date/Author: 2026-06-09, Claude (planning).

- Decision: Gallery route gating — ship `/monad` always-available to everyone (not dev-gated), labelled "preview · alpha". The discovery entry point is intentionally hard to find: a faint, low-opacity `α` link fixed in the bottom-right corner of the Settings → Account (profile) page, deliberately outside the structured settings navigation.
  Rationale: User instruction — "доступна всегда, доступна всем, preview alpha" with the button "в каком-то неожиданном месте… в профиле скрыто… так, чтобы найти её было сложно". The route is reachable by anyone who knows it; the corner link is the easter-egg discovery path and never clutters real navigation.
  Date/Author: 2026-06-09, Claude (implementation).

- Decision: Binding roadmap reconciliation — still open (Open Question 2); does not block PR-02.
  Rationale: PR-03..14 surface assignment should be checked against the original PORT BRIEF before each binding; the gallery does not depend on it.
  Date/Author: 2026-06-09, Claude.

- Decision: Render-smoke test depth — add no React render test for the gallery; rely on typecheck + lint as the automated gate and the human/local run as the visual gate.
  Rationale: The desktop package has no `@testing-library/react` / jsdom / happy-dom harness (`bun test` preloads only a terminal-focused `test-setup.ts`). Standing up a DOM harness purely for a presentational gallery is out of scope and would be a larger change than the gallery itself. A render test without a DOM would be validation theater.
  Date/Author: 2026-06-09, Claude (implementation).

- Decision: Branch/PR strategy for PR-02 — commit on the existing branch `claude/eager-meitner-K6A5C` (PR #40), keep it a draft.
  Rationale: The session's branch rules pin development to `claude/eager-meitner-K6A5C`; a separate branch would need explicit user permission. PR #40 already carries the cumulative MONAD work (PR-00/01/12), so the gallery stacks naturally on top. Flipping #40 to "ready for review" stays the user's decision.
  Date/Author: 2026-06-09, Claude (implementation).


## Outcomes & Retrospective

**Phase A (PR-02 gallery) — delivered 2026-06-09.** A new always-available route `/monad` renders the full MONAD surface: a `PrimitivesSection` (all nine primitives, each with an idle→active toggle), a `CompositesSection` (four-step tool-call lifecycle + S0→S\* transition with `DeltaField`), a `FoundationSection` (the PR-00 motion helpers), and a `GalleryControls` bar for font / appearance / motion preference. The page is labelled "preview · alpha" and is reachable via a deliberately discreet faint `α` link in the bottom-right corner of Settings → Account. The gallery mounts its own `MonadThemeProvider` scope, so it does not restyle the product shell.

Measured against the Purpose: a developer on a local build can now open one route and visually verify every MONAD element and every motion state in one place — the instrument that makes the Phase B bindings checkable. What this environment could verify is verified (typecheck 0, lint 0 over 4736 files, sherif clean, existing tests 4/4); what it cannot (the actual pixels/motion, because Electron won't launch here) is deferred to the human visual pass — the one remaining gap for Phase A.

Phase B (PR-03..14 bindings) is in progress: PR-13 (Settings motion preference) shipped 2026-06-09 (`56f85e0`) as the safest, most isolated binding — additive, no hot/virtualized surface touched, and it gives the global motion preference a real home. The remaining bindings (PR-03..11) modify real interactive surfaces (tabs, sidebar, diff header, review gate, chat tool-calls, terminal frame, notifications, status badges) and (a) cannot be visually verified in this cloud environment and (b) depend on the still-unconfirmed primitive→surface mapping (Open Question 2 — reconcile against the original PORT BRIEF). They should be done one at a time with a human visual pass, or on explicit "best-guess" instruction.


## Context and Orientation

This work lives entirely in the **desktop** app (`apps/desktop`), **renderer** process (`apps/desktop/src/renderer`, a browser environment — no Node.js imports). No other apps (`web`, `marketing`, `api`, `admin`, `docs`) and no shared packages (`db`, `ui`, `shared`, `trpc`) are touched. No IPC channels (the type-safe message channels between Electron's main and renderer processes) are involved — the gallery is pure renderer UI.

The MONAD library is at `apps/desktop/src/renderer/monad`. Its public surface is a single barrel, `apps/desktop/src/renderer/monad/index.ts`, which re-exports three groups:

- **Motion + hook** (`monad/motion`): `springs`/`ease`/`duration`/`instant` tokens (in `motion/tokens.ts`), and `useMotionPreference()` (in `motion/useMotionPreference`). `useMotionPreference()` returns `{ preference, osReducedMotion, level, reduced, disabled, setPreference }` where `level` is the effective motion level after folding in the OS `prefers-reduced-motion` setting, `reduced` means "soften motion", and `disabled` means "no motion at all". The stored preference is one of `"full" | "essential" | "off"` and is persisted via a zustand store.
- **Primitives** (`monad/primitives`): the nine components plus a shared `MonadStatus` type and `statusColor` map (`monad/primitives/status.ts`).
- **Providers** (`monad/providers`): `MonadThemeProvider` (renders the `[data-monad-root]` container that scopes all MONAD CSS, self-imports `tokens.css`, and holds an ephemeral dark/light `appearance`), `FontProvider` (sets `data-font` on the document root and exposes `useMonadFont()`), and `FontSwitcher` (a ready-made control that calls `useMonadFont().setFont`).

The exact prop shapes of the nine primitives (captured during discovery, copy them verbatim) are:

    StateNode        { label: ReactNode; status?: MonadStatus; active?: boolean; className?: string }
    TransitionEdge   { active?: boolean; length?: number; color?: string; className?: string }
    EventParticle    { path?: string; active?: boolean; size?: number; color?: string; duration?: number; className?: string }
    RuntimeFrame     { label?: ReactNode; running?: boolean; children?: ReactNode; className?: string }
    MonadCapsule     { label?: ReactNode; prerequisites?: CapsulePrerequisite[]; children?: ReactNode; className?: string }
    TraceStream      { lines: TraceLine[]; className?: string }
    ValidatorGate    { state?: ValidatorState; label?: ReactNode; className?: string }
    TargetAttractor  { reached?: boolean; size?: number; label?: ReactNode; className?: string }
    DeltaField       { from?: ReactNode; to?: ReactNode; additions?: number; deletions?: number; className?: string }

The supporting exported types are `MonadStatus = "resting" | "transition" | "verified" | "warn" | "error"`, `CapsulePrerequisite` (used by `MonadCapsule`), `TraceLine`/`TraceTone` (used by `TraceStream`), and `ValidatorState` (used by `ValidatorGate`). When you build the gallery, read each primitive's `.tsx` file once to copy the exact shape of `CapsulePrerequisite`, `TraceLine`, and `ValidatorState` (e.g., the allowed `ValidatorState` values such as `pending`/`validating`/`passed`/`failed`), since those are object/enum shapes rather than plain primitives.

**Routing.** The renderer uses TanStack Router with file-based generation. The generator is configured by `apps/desktop/tsr.config.json`: routes live under `src/renderer/routes`, the generated tree is `src/renderer/routeTree.gen.ts`, a route's page file must be named `page.tsx`, and any other `.tsx` in a route folder is ignored by the generator (so co-located components are safe). A route file exports a `Route` created with `createFileRoute("/<path>/")`. For example, `routes/sign-in/page.tsx` contains `export const Route = createFileRoute("/sign-in/")({ component: SignInPage })`. The generator runs via `bun run --cwd apps/desktop generate:routes` (it is also run automatically by `pretypecheck` before `typecheck`).

**Why the gallery cannot leak into the product.** All MONAD color/spacing rules are scoped under the `[data-monad-root]` attribute that `MonadThemeProvider` renders. The product's own theme keeps full control of `:root`. Therefore, mounting the gallery does not alter the app's fonts, background, or colors anywhere outside the gallery container — this is the same mechanism that let the run-button binding (PR-12) use product Tailwind colors without pulling MONAD tokens in.


## Plan of Work

The work proceeds in two phases. Phase A (Milestones M1–M4) builds the `/monad` gallery — this is the detailed, immediate deliverable. Phase B (Milestones M5+) binds primitives to real product surfaces, one surface per milestone, each gated behind a human visual pass against the gallery.

### Phase A — The `/monad` gallery (PR-02)

The gallery is a single new route plus a tree of co-located, presentational components under `routes/monad/components/`. It mounts `MonadThemeProvider` → `FontProvider` once at the top, then renders sections. Each section renders one primitive (or composite) in a labelled card. Every card that has an "active" or animated state gets a local toggle (a plain checkbox/button using product `@rox/ui` controls) so a human can flip it from resting to active and watch the motion. A control bar at the top exposes the three global switches: font theme (`FontSwitcher`), dark/light (`useMonadTheme().toggleAppearance`), and motion preference (`useMotionPreference().setPreference` across `full`/`essential`/`off`).

Concretely, create:

- `apps/desktop/src/renderer/routes/monad/page.tsx` — the route. It does nothing but render `<MonadGallery />`:

        import { createFileRoute } from "@tanstack/react-router";
        import { MonadGallery } from "./components/MonadGallery";

        export const Route = createFileRoute("/monad/")({
        	component: MonadGallery,
        });

- `apps/desktop/src/renderer/routes/monad/components/MonadGallery/MonadGallery.tsx` (+ `index.ts` barrel) — the shell. It establishes the provider scope and lays out sections. Skeleton:

        import { Button } from "@rox/ui/button";
        import {
        	FontSwitcher,
        	MonadThemeProvider,
        	FontProvider,
        	useMonadTheme,
        	useMotionPreference,
        	type MotionPreference,
        } from "renderer/monad";
        import { PrimitivesSection } from "../PrimitivesSection";
        import { CompositesSection } from "../CompositesSection";

        export function MonadGallery() {
        	return (
        		<MonadThemeProvider>
        			<FontProvider>
        				<div className="min-h-screen overflow-auto p-8 font-[family-name:var(--monad-font)]">
        					<GalleryControls />
        					<PrimitivesSection />
        					<CompositesSection />
        				</div>
        			</FontProvider>
        		</MonadThemeProvider>
        	);
        }

        function GalleryControls() {
        	const { appearance, toggleAppearance } = useMonadTheme();
        	const { level, setPreference } = useMotionPreference();
        	const prefs: MotionPreference[] = ["full", "essential", "off"];
        	return (
        		<div className="mb-8 flex flex-wrap items-center gap-3">
        			<FontSwitcher />
        			<Button variant="outline" size="sm" onClick={toggleAppearance}>
        				Appearance: {appearance}
        			</Button>
        			{prefs.map((p) => (
        				<Button
        					key={p}
        					size="sm"
        					variant={level === p ? "default" : "outline"}
        					onClick={() => setPreference(p)}
        				>
        					{p}
        				</Button>
        			))}
        		</div>
        	);
        }

  Note the `font-[family-name:var(--monad-font)]` arbitrary Tailwind class — this opts the gallery into the MONAD font stack (valid Tailwind v4 syntax already used by `TraceStream`).

- `apps/desktop/src/renderer/routes/monad/components/PrimitivesSection/PrimitivesSection.tsx` (+ `index.ts`) — renders nine cards. Build a tiny local `GalleryCard` helper (co-located under `PrimitivesSection/components/GalleryCard/`) that draws a labelled bordered box and renders `children`. For primitives with an active state, hold a local `useState(false)` `active` flag and a toggle button inside the card so the resting→active transition is observable. Cover, at minimum, every prop that changes appearance:
  - `StateNode` — one card showing all `MonadStatus` values side by side (`resting`/`transition`/`verified`/`warn`/`error`) and an `active` (glow) toggle.
  - `TransitionEdge` — resting edge; toggle `active` to start the travelling signal.
  - `EventParticle` — resting; toggle `active` to run the loop along the default path.
  - `RuntimeFrame` — wraps some placeholder content; toggle `running` to show the scan sweep.
  - `MonadCapsule` — with 2–3 `prerequisites` entries (copy the `CapsulePrerequisite` shape from the source).
  - `TraceStream` — with 4–5 `lines` covering each `TraceTone`.
  - `ValidatorGate` — four cards or one card with a cycling control across each `ValidatorState` (`pending`/`validating`/`passed`/`failed`).
  - `TargetAttractor` — toggle `reached` to settle it green.
  - `DeltaField` — `from`/`to` labels with non-zero `additions`/`deletions`.

- `apps/desktop/src/renderer/routes/monad/components/CompositesSection/CompositesSection.tsx` (+ `index.ts`) — 2–3 composites that combine primitives into a recognizable agentic scene, proving the pieces compose. Suggested:
  - **Tool-call lifecycle strip**: `MonadCapsule` (prerequisites) → `RuntimeFrame` (running) → `ValidatorGate` (passed), wired to a single "play" toggle that advances the scene.
  - **State machine row**: `StateNode` "S0" → `TransitionEdge` (active) → `StateNode` "S*" (verified), with `DeltaField` underneath as the S0→S* diff header.

After the route file exists, run the route generator so `routeTree.gen.ts` includes `/monad`. Do **not** hand-edit `routeTree.gen.ts`; it is generated.

To make the route reachable on a local build, add a **dev-only** link on the sign-in page. In `apps/desktop/src/renderer/routes/sign-in/page.tsx`, inside the existing `{env.NODE_ENV === "development" && ( ... )}` block (next to the "Sign in as Local Admin (dev)" button), add:

        <Button asChild variant="ghost" size="sm" className="w-full">
        	<Link to="/monad">Open MONAD gallery (dev)</Link>
        </Button>

  importing `Link` from `@tanstack/react-router` (the file already imports from that package). This is the only edit to an existing product file; it is fully guarded by the development check and never renders for users.

### Phase B — Product-surface bindings (PR-03..14)

Each binding is its own milestone and, ideally, its own follow-up ExecPlan, because each touches real product code and carries its own regression risk. The reconstructed mapping (to be reconciled with the PORT BRIEF, Open Question 2) is:

- PR-03 — **Workspace tab bar** (`routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/…` tab components): `MotionList` for tab enter/leave/reorder; optionally `StateNode`/`TransitionEdge` for the active-tab indicator.
- PR-04 — **Workspace/project sidebar** (`routes/_authenticated/_dashboard` sidebar): `MotionList` staggered entrance; `StatusPulse` on run/activity badges.
- PR-05 — **Diff / Changes header** (`changes-sidebar-diffs-tree`, `v2-diff-pane`): `DeltaField` as the S0→S\* header with `+`/`−` counts.
- PR-06 — **Review / CI gate** (`v2-review-tab`): `ValidatorGate` driven by review/CI status.
- PR-07 — **Agent tool-call lifecycle** (chat/agent tool-call rendering): `MonadCapsule` (prerequisites) + `RuntimeFrame` (running) + `ValidatorGate` (result) + `TraceStream` (events) — the composite proven in M3.
- PR-08 — **Runtime frame** around the terminal/run pane while a run command is active: `RuntimeFrame`.
- PR-09 — **Task / goal completion** (tasks surface, PR-merged state): `TargetAttractor`.
- PR-10 — **Event flow / notifications** (`V2NotificationController`): `EventParticle`.
- PR-11 — **Status pulses** across workspace status badges: `StatusPulse`.
- PR-12 — **Run button** — DONE (`2323475`, `7a39e82`).
- PR-13 — **Settings: motion + font** (`routes/_authenticated/settings/appearance`) — DONE (`56f85e0`, motion-preference selector). Font switcher deferred: the MONAD font only affects MONAD-scoped surfaces, so it adds little in product settings until more bindings land; revisit alongside PR-03..11.
- PR-14 — **Rollout + cleanup**: finalize, reconcile/guard the dev gallery entry point per the resolved Open Question 1, update `monad/README.md` roadmap.

The governing rule for Phase B: **animate opacity/transform/layout only; never animate xterm rows, CodeMirror rows, or large virtualized lists; gate every animation on `useMotionPreference`; render the resting state first** (per `monad/README.md` and the root `AGENTS.md` TanStack-DB cache-first rule). Reuse the MONAD JS helpers and product Tailwind colors at the binding site, exactly as PR-12 did, so MONAD's scoped CSS never enters a product surface.


## Concrete Steps

All commands assume the repository root `/home/user/set` unless a `--cwd` is shown.

1. Create the route, gallery shell, and section components listed in Plan of Work (Phase A). Create folders with `index.ts` barrels and named exports, tabs for indentation.

2. Generate the route tree so `/monad` is registered:

        bun run --cwd apps/desktop generate:routes
        # Expected: tsr regenerates apps/desktop/src/renderer/routeTree.gen.ts with a /monad entry (no manual edits).

3. Format and lint the new files (Biome runs at the repo root):

        node_modules/.bin/biome check --write apps/desktop/src/renderer/routes/monad
        # Expected: "Checked N files" with fixes applied or "No fixes applied".

4. Typecheck the desktop app (this also re-runs `generate:routes` and `generate:icons` via `pretypecheck`):

        bun run --cwd apps/desktop typecheck
        # Expected: tsc --noEmit completes with no output (exit 0).

5. Run the render-smoke tests added in M4 and the existing MONAD tests:

        bun test apps/desktop/src/renderer/monad
        bun test apps/desktop/src/renderer/routes/monad
        # Expected: all tests pass (the existing useMotionPreference suite is 4/4).

6. Run the full repository lint gate (CI fails on any Biome diagnostic, including warnings):

        bun run lint
        # Expected: "Checked N files ... No fixes applied." and exit 0.

7. Verify sherif (workspace dependency ordering) is still clean:

        bunx sherif
        # Expected: no "unordered-dependencies" or other findings.


## Validation and Acceptance

Acceptance has two layers because of the launch constraint.

**Layer 1 — verifiable in this remote environment (must all pass before pushing):**

    bun run --cwd apps/desktop typecheck   # exit 0, no type errors
    bun run lint                            # exit 0, no Biome diagnostics
    bun test apps/desktop/src/renderer      # MONAD + gallery render-smoke tests pass
    bunx sherif                             # clean

The route generator output must contain a `/monad` route, and `routeTree.gen.ts` must not have been hand-edited (it is fully generated). The render-smoke tests (M4) assert, at minimum, that `MonadGallery` and each section render without throwing under `useMotionPreference` returning `disabled: true` (motion off), which is the strongest automated proxy we have for "the resting state is always visible".

**Layer 2 — human visual pass on a local build (separate gate, performed by a developer with a working Electron toolchain; cannot run here):**

    bun --cwd apps/desktop dev
    # The desktop app launches. On the sign-in screen (development build),
    # click "Open MONAD gallery (dev)" to navigate to /monad.

Observe and confirm:

- Every primitive renders in its **resting** state on first paint (nothing is blank waiting for an animation clock).
- Toggling a card's "active" control starts the expected motion (travelling signal on `TransitionEdge`, scan sweep on `RuntimeFrame` `running`, particle loop on `EventParticle`, green settle on `TargetAttractor` `reached`, etc.).
- The three global controls work: `FontSwitcher` visibly changes the gallery typeface across the three themes; the appearance button flips dark/light within the gallery only; setting motion preference to `off` makes all looping/entrance motion stop and state changes become instantaneous (this is the reduced-motion contract).
- The rest of the app's chrome (window frame, any visible product UI) is **unchanged** by the gallery — confirming MONAD's CSS did not leak past `[data-monad-root]`.

For each Phase B binding, Layer 1 is identical, and Layer 2 adds: open the real surface, exercise its state transitions, and confirm it matches the corresponding gallery card's look and motion, including with motion preference `off`.


## Idempotence and Recovery

All steps are safe to re-run. `bun run --cwd apps/desktop generate:routes` is deterministic — if `routeTree.gen.ts` drifts or a route fails to appear, delete nothing by hand; just re-run the generator. Biome formatting and the typecheck/test commands are read-or-rewrite-in-place and can be repeated freely.

If the gallery route does not appear after generation, verify the file is named exactly `page.tsx` and lives directly under `routes/monad/` (not in a subfolder), and that `createFileRoute` uses `"/monad/"` with the trailing slash (matching the `indexToken: "page"` convention). Co-located component files must not be named `page.tsx`/`layout.tsx`, or the generator will misinterpret them.

The only edit to existing product code is the dev-only sign-in link; it is reversible by deleting the single `<Button asChild>…<Link to="/monad">…` block, and it is inert in production by construction.

If a Phase B binding regresses a real surface, revert that surface's commit — bindings are independent and additive, so reverting one does not affect the gallery or other bindings.


## Artifacts and Notes

Representative `GalleryCard` helper (co-located under `PrimitivesSection/components/GalleryCard/`):

        import type { ReactNode } from "react";

        export interface GalleryCardProps {
        	title: string;
        	children: ReactNode;
        }

        export function GalleryCard({ title, children }: GalleryCardProps) {
        	return (
        		<div className="rounded-md border border-border/40 p-4">
        			<div className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
        				{title}
        			</div>
        			<div className="flex min-h-16 items-center gap-4">{children}</div>
        		</div>
        	);
        }

Representative render-smoke test (M4), `MonadGallery.test.tsx`, kept shallow per Open Question 3 — it confirms the gallery renders with motion fully disabled (the resting-state contract). Confirm the project's React test setup before finalizing the import (`@testing-library/react` may need a happy-dom/jsdom preload under `bun test`); if that harness is not already configured in the repo, keep this layer to a pure-function assertion and rely on Layer 2 for visuals, recording the choice in the Decision Log:

        import { render } from "@testing-library/react";
        import { MonadGallery } from "./MonadGallery";

        test("gallery renders its resting state without throwing", () => {
        	const { container } = render(<MonadGallery />);
        	expect(container.querySelector("[data-monad-root]")).not.toBeNull();
        });


## Interfaces and Dependencies

No new libraries. The gallery depends only on the existing MONAD barrel (`renderer/monad`), the shared UI `@rox/ui/button`, and `@tanstack/react-router`. No IPC channels, no `packages/*` changes, no database changes.

Types/functions that must exist and be used unchanged (already shipped):

- From `renderer/monad`: `MonadThemeProvider`, `FontProvider`, `FontSwitcher`, `useMonadTheme()` (`{ appearance, toggleAppearance, setAppearance }`), `useMotionPreference()` (`{ level, reduced, disabled, setPreference, … }`), `MotionPreference`, and the nine primitives with the prop shapes listed in Context and Orientation.

New public surface created by this plan:

- Route `"/monad/"` via `createFileRoute` in `routes/monad/page.tsx`, rendering `MonadGallery`.
- `MonadGallery` (no props), `PrimitivesSection` (no props), `CompositesSection` (no props), `GalleryCard({ title, children })` — all named exports with `index.ts` barrels, presentational only.

Phase B bindings introduce no new MONAD API; they import existing primitives into existing product components and add local state/toggles at the call site only.


## Revision Note

2026-06-09 (Claude): Initial draft. Scope chosen to put the `/monad` gallery (PR-02) first specifically because the Electron app cannot be launched in this remote environment, making the gallery the only viable instrument for human visual verification; every later binding is gated against it. Discovery confirmed routing tokens, provider/primitive signatures, and the no-leak CSS scoping, all embedded above so the plan is self-contained. Open Questions 1–4 remain to be resolved at the approval gate.
