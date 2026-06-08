# Motion Frame — State-First Design System (2026-06-08)

Turn the State-First / MONAD prototype HTML into a **reusable, in-repo design
system** ("Motion Frame") that (a) re-skins the existing Execution Circuit UI
and (b) becomes the standard kit for visualizing concepts, diagrams and answers.

This doc is also the **briefing packet**: it carries the goal, the State-First
decomposition, and three copy-paste briefs (design pass, implementation agent,
orchestrator).

## Status

- **T1 (semantic tokens)** — landed in this PR: `--sf-*` layer in
  `packages/ui/src/globals.css`.
- **T2 (motion primitives)** — landed in this PR: `@rox/ui/motion`
  (`Reveal`, `Stagger`/`StaggerItem`, `Segmented`, `SignalTravel`, `springs`,
  `useShouldAnimate`). Biome- and typecheck-clean.
- **T3–T6** — specified below, not yet implemented.

## 0. Key insight — we are not starting from scratch

The prototypes look like marketing pages, but they are the **design spec for a
feature that already exists in this repo**:

| Prototype "atom" | Already in the codebase |
| --- | --- |
| State / Target State | `StateSpec`, `targetState` — `packages/workflow-core/src/circuit/types.ts` |
| Transition | `TransitionSpec` |
| Event | `EventSpec` |
| Runtime | `RuntimeBindingSpec` |
| Monad | `ExecutionMonadSpec` |
| Validator | `ValidatorSpec` |
| Trace / Δ | the spec + generated-draft flow |

The whole circuit is `ExecutionCircuitSpec`. The **current real UI** is
`apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/ExecutionCircuitPanel/ExecutionCircuitPanel.tsx`
— a bare, read-only list (Target + transitions, "Generate draft" + "Copy
prompt"). It imports **no** `motion`/`AnimatePresence`, so the "single shared
Motion wrapper" recommendation in `plans/20260608-ui-polish-motion-animation-notes.md`
is still fully actionable. `@rox/ui` already depends on `motion@12.38` and
`@xyflow/react@12.10`.

So the task is **not** "build a new thing." It is: *lift the prototype's motion
+ visual vocabulary into a reusable `packages/ui` layer, then render the domain
types we already have with it.*

### Source of truth

The readable reference prototypes are committed alongside this plan:

- `plans/motion-frame-prototypes/index_5.html` — the MONAD landing.
- `plans/motion-frame-prototypes/StateFirst_Series.html` — the library contract.

These two are the canonical references. The three large `*_standalone*.html`
"Superset" exports (minified, asset-hashed; 0.3–1.6 MB each) are **not**
committed — they are not human-readable and add no spec value over the two
above. Use them, if ever needed, only as a visual render.

## 1. The final refinement — "Motion Frame" in three layers

A reusable system = three stacked layers, each shippable on its own.

### Layer A — Semantic tokens ("color = meaning")

The repo's tokens today are pure neutral greys (`oklch(... 0 0)`). The
prototypes' whole thesis is that **color carries meaning**. We **add** a
semantic layer on top of the shadcn neutrals (never replace them):

| Token | Meaning (one job) | Hue |
| --- | --- | --- |
| `--sf-state` | a neutral state node | ink / neutral |
| `--sf-target`, `--sf-verified` | the target & a passed validator | green |
| `--sf-transition`, `--sf-event` | work in motion, an event firing | orange |
| `--sf-accent` | "the new pose becomes clear" / interactive highlight | electric blue |
| `--sf-fail`, `--sf-gap` | a failing validator, an incomplete monad | muted amber |
| `--sf-friction` | HOW-first noise, rework, the old pose | grey (never glows) |

Shipped in T1 with light + dark values and a `@theme inline` mapping so
utilities like `text-sf-target` / `bg-sf-accent` resolve. Final OKLCH values are
provisional pending the design pass (Decision #1).

### Layer B — Motion primitives (`@rox/ui/motion`)

Port `lib/motion.js` (`travel`, `onInView`, `segmented`) and the Series motion
conventions into React primitives over `motion/react`. **One vocabulary, one
import site** — honoring the team's anti-fragmentation note.

| Prototype mechanic | Motion Frame primitive | Built on |
| --- | --- | --- |
| `M.travel(path, dot)` signal along a rail | `<SignalTravel path>` | `offset-path` + `motion` |
| `M.onInView` reveal | `<Reveal>` | `whileInView` |
| staggered entrance | `<Stagger>` + `<StaggerItem>` | variants + `staggerChildren` |
| segmented / focus toggle glider | `<Segmented>` | `layoutId` |
| spring feel | `springs.snap` = `{ stiffness: 280, damping: 30 }` | preset |
| **reduced motion** | `useShouldAnimate()` gates every primitive | `useReducedMotion` |

Naming note: the reduced-motion gate is exported as **`useShouldAnimate()`**
(not `useReducedMotion`) so the call site reads as intent and does not shadow
Motion's own hook.

Scope vs. the existing desktop kit: `apps/desktop/src/renderer/motion/` (~40
components: dialogs, toasts, route transitions, browser chrome) **stays where it
is** — it is desktop app-chrome, not cross-app diagram motion. `@rox/ui/motion`
houses only the **cross-app** primitives the circuit/diagram kit and other apps
(docs, marketing, web) reuse. The two coexist; direct `motion/react` imports in
feature code remain allowed. No mass migration is in scope for this epic; a
later consolidation task may graduate genuinely-generic desktop primitives into
`@rox/ui/motion` (tracked as an open decision, not a blocker).

### Layer C — Concept components (`@rox/ui/circuit`)

The reusable diagram kit. These consume the **real domain types** from
`@rox/workflow-core`, which is what makes the system reusable rather than
decorative:

- Atoms: `<StateNode>`, `<TargetState>`, `<TransitionRail>`, `<EventPulse>`,
  `<MonadCapsule>`, `<ValidatorGate>`, `<TraceLine>`.
- **Keystone:** `<CircuitCanvas spec={ExecutionCircuitSpec} />` — renders *any*
  circuit spec with the prototype's motion. The single component the Execution
  Circuit UI, docs, and "explain a concept" surfaces all reuse.
- Showcase scenes: `<DeltaDecomposition>`, `<RefocusLens>`, `<TargetGravity>`,
  `<MotionGrid>` (the looping icon set for docs/marketing).

`<CircuitCanvas>` error strategy (T4): validate the incoming `spec` (states
referenced by transitions exist, `initialState`/`targetState` resolve) and
return a **structured** error list; wrap rendering in an error boundary and show
a legible fallback (which states/transitions are missing) instead of throwing on
a malformed or partial spec.

Architectural note — **`@rox/ui` → `@rox/workflow-core` dependency.**
`<CircuitCanvas>` depending on the domain types buys type-safety and a single
spec shape, at the cost of coupling the UI package to a domain package. The
alternative is dependency inversion: define a **minimal render-spec interface in
`@rox/ui`** and have `@rox/workflow-core` satisfy it. This is Decision #4 below;
it does **not** affect T1/T2 (which add no new dependency).

## 2. How to choose the goal & set the task (State-First, applied to itself)

Use the method on the work itself — this is the template for *every* task.

- **S₀ (current):** bare read-only circuit panel; neutral-only tokens; `motion`
  used directly across the app (hundreds of call sites — reproduce with
  `rg -t ts -t tsx "from \"motion/react\"|from \"framer-motion\""`); prototypes
  are dead HTML.
- **S\* (target, verified):** `@rox/ui/motion` + `@rox/ui/circuit` shipped;
  `<CircuitCanvas>` renders a real `ExecutionCircuitSpec`; `ExecutionCircuitPanel`
  re-skinned with it; semantic tokens in `globals.css` (light+dark, AA);
  `prefers-reduced-motion` respected everywhere; a gallery route exists; `bun
  run lint` and `typecheck` green; existing circuit tests still pass.
- **Δ = S\* − S₀ → the transitions (the actual work items):**

| # | Transition | Validator (measurable acceptance) | Runtime |
| --- | --- | --- | --- |
| T1 | Semantic token layer | tokens resolve in light+dark; AA contrast checked; shadcn neutrals byte-unchanged | `packages/ui/src/globals.css` |
| T2 | Motion primitives `@rox/ui/motion` | typecheck + Biome clean; each primitive renders its final state when `useShouldAnimate()` is false (unit test) | `packages/ui/src/motion/` |
| T3 | Concept atoms (Layer C) | render purely from props; Storybook/story per atom; jsdom render test asserts no throw | `packages/ui/src/circuit/` |
| T4 | `<CircuitCanvas spec>` | two renders of one spec produce identical DOM (snapshot); invalid spec yields the fallback + structured errors, never throws | `packages/ui/src/circuit/` |
| T5 | Re-skin `ExecutionCircuitPanel` | generate-draft + copy-prompt behavior preserved; text selectable; existing panel tests pass | `apps/desktop` |
| T6 | Gallery route + `<MotionGrid>` icon set | route mounts in a smoke test; ≥1 icon imported and rendered in `apps/docs` | `apps/desktop` / `apps/docs` |

Each transition's **monad** = { context files above, runtime, the validator,
and a trace = the PR diff + its story page }. A transition is done when its
validator passes — not when code is written. Each validator is an automated
check (unit/integration/snapshot/smoke) owned by the implementing PR unless
marked manual.

## 3. Who to send what — two different "Claudes", two jobs

### Brief A → Claude (design / Artifacts side, claude.ai)

> **Goal:** Reconcile the State-First prototypes into ONE canonical design-system
> contract I can hand to an engineer.
>
> **Inputs:** `plans/motion-frame-prototypes/index_5.html` (MONAD landing) and
> `StateFirst_Series.html` (library contract) — the source of truth.
>
> **Produce, as separate artifacts:**
> 1. **Tokens** — final semantic palette as CSS custom properties **and** JSON,
>    in OKLCH, light + dark, with AA-contrast notes. One hue = one job:
>    state(neutral), target/verified(green), transition/event(orange),
>    accent(electric blue), fail/gap(amber), friction(grey, never glows).
> 2. **Type scale** — Inter (UI) + JetBrains Mono (tech labels: state ids, Δ,
>    `monad{…}`) **(recommended; see Decision #2)**. Sizes/weights/spacing table.
> 3. **Motion spec** — a one-table "one job per animation" vocabulary + the
>    concrete duration/easing values for each primitive + the
>    `prefers-reduced-motion` rule.
> 4. **Component gallery** — ONE clean, un-minified HTML page showing the 8
>    atoms + CircuitCanvas + the showcase scenes, inheriting the tokens.
>
> **Constraint:** near-monochrome, dark-first, color = meaning. Do not invent a
> sixth hue.

### Brief B → Claude Code (the repo agent on `agisota/set`)

> **Goal:** Implement Motion Frame per this plan. Read it first; also read
> `plans/20260608-ui-polish-motion-animation-notes.md` and honor its "one shared
> motion wrapper" rule.
>
> **Domain to render:** `packages/workflow-core/src/circuit/types.ts`
> (`ExecutionCircuitSpec`). **Thing to re-skin:**
> `apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/ExecutionCircuitPanel/ExecutionCircuitPanel.tsx`.
> **Visual contract:** the tokens + motion spec + gallery from Brief A.
>
> **Build in order T1→T6 (section 2). Each transition is its own PR-able slice.**
> Exports already added / to add in `@rox/ui` package.json:
> `"./motion": "./src/motion/index.ts"` (done), and for T3/T4
> `"./circuit": "./src/circuit/index.ts"` + `"./circuit/*": "./src/circuit/*/index.ts"`.
>
> **Guardrails (non-negotiable):**
> - Tokens are **added** to `globals.css`; never modify the shadcn neutral tokens.
> - Use `motion/react` (already a dep in `@rox/ui`); do **not** add a new
>   animation dependency; route shared motion through `@rox/ui/motion`.
> - Every animation gates on `useShouldAnimate()` (reduced motion).
> - `<CircuitCanvas>` validates its spec and renders a fallback (never throws).
> - Follow AGENTS.md co-location: `ComponentName/ComponentName.tsx` + `index.ts`
>   + co-located `.test`/`.stories`.
> - `@xyflow/react` (already a dep) is allowed for the graph/morph scenes.
> - Preserve `ExecutionCircuitPanel` behavior and keep text selectable
>   (`select-text`).
> - `bun run lint` exits 0 (warnings fail CI) and `bun run typecheck` green
>   before every push.

### Brief C → your orchestrating agent

> - **Goal:** drive Motion Frame T1→T6 to done.
> - **Inputs:** this plan; the two prototype HTML files; the Brief A design
>   artifacts; `circuit/types.ts`; `ExecutionCircuitPanel.tsx`.
> - **Process:** one draft PR per transition; each PR must make its validator
>   (section 2) pass before review; on a failing validator, re-diagnose and
>   re-push rather than widening scope.
> - **Success criteria:** all six validators pass; no regression in existing
>   circuit/panel tests; lint + typecheck green.
> - **Escalation / rollback:** if a transition's validator fails after ~3
>   focused attempts, or needs an architectural decision (e.g. Decision #4),
>   stop and ask rather than refactor broadly; abandon a draft PR rather than
>   merge a red one.
> - **Trace format:** per transition, report `PR <link> · validator <pass/fail>
>   · story <link>`.

## 4. File map

```text
packages/ui/
├── package.json                     # + exports: "./motion" (done); "./circuit*" (T3/T4)
├── src/globals.css                  # + semantic --sf-* token layer (T1, done)
├── src/motion/                      # Layer B (T2, done)
│   ├── springs.ts  useShouldAnimate.ts
│   ├── Reveal/  Stagger/  StaggerItem/  Segmented/  SignalTravel/
│   └── index.ts                     # → @rox/ui/motion
└── src/circuit/                     # Layer C (T3, T4)
    ├── StateNode/  TargetState/  TransitionRail/  EventPulse/
    ├── MonadCapsule/  ValidatorGate/  TraceLine/
    ├── CircuitCanvas/               # consumes @rox/workflow-core types
    ├── scenes/ (DeltaDecomposition, RefocusLens, TargetGravity, MotionGrid)
    └── index.ts                     # → @rox/ui/circuit/*

apps/desktop/.../ExecutionCircuitPanel/ExecutionCircuitPanel.tsx   # re-skin (T5)
apps/desktop (gallery route) + apps/docs (MotionGrid icons)        # (T6)
plans/motion-frame-prototypes/                                     # committed references
```

## 5. Open decisions

Each is a "known unknown" with an owner.

1. **Palette** (Brief A) — multi-hue-disciplined (recommended; see Layer A) vs
   single-accent Series. T1 ships provisional OKLCH values to be ratified here.
2. **Display font** (Brief A) — Inter + JetBrains Mono is the **recommended**
   default (matches repo); Bebas/Lekton (the Superset variant) only if a
   distinct marketing display face is wanted.
3. **Graph scenes** (Brief B) — hand-rolled SVG vs `@xyflow/react` (recommended
   for team→graph / morph scenes).
4. **`@rox/ui` → `@rox/workflow-core` coupling** (Brief B, architecture) — import
   domain types directly (simpler, type-safe) vs. dependency-inversion via a
   minimal render-spec interface in `@rox/ui`. Decide before T4.
5. **Accessibility** (Brief B) — focus indicators, ARIA labelling for diagrams,
   keyboard navigation for `<CircuitCanvas>`.
6. **Performance** (Brief B) — bundle budget for `@rox/ui/circuit`, target FPS,
   when to drop to static rendering on weak devices.
7. **Browser support** (Brief A/B) — minimum targets; affects `offset-path`
   (`<SignalTravel>`), which needs Chrome/Edge ≥ 79, Safari ≥ 16. Provide a
   static fallback if older browsers must be supported.
8. **Mobile / touch** (Brief B) — gesture support and tablet responsiveness for
   the interactive scenes.
