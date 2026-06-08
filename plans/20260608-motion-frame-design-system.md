# Motion Frame — State-First Design System (2026-06-08)

Turn the State-First / MONAD prototype HTML into a **reusable, in-repo design
system** ("Motion Frame") that (a) re-skins the existing Execution Circuit UI
and (b) becomes the standard kit for visualizing concepts, diagrams and answers.

This doc is also the **briefing packet**: it carries the goal, the State-First
decomposition, and two copy-paste briefs (one for the design pass, one for the
implementation agent).

---

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
| Trace / Δ | the spec + generated draft flow |

The whole circuit is `ExecutionCircuitSpec`. The **current real UI**
(`apps/desktop/.../components/ExecutionCircuitPanel/ExecutionCircuitPanel.tsx`)
is a bare, read-only grey list — none of the prototype's motion or visual
language. And the team **already wrote** `plans/20260608-ui-polish-motion-animation-notes.md`
recommending exactly "a single shared `Motion`/`AnimatePresence` wrapper in
`packages/ui`." `@rox/ui` already depends on `motion@12.38` and
`@xyflow/react`.

So the task is **not** "build a new thing." It is: *lift the prototype's motion
+ visual vocabulary into a reusable `packages/ui` layer, then render the
domain types we already have with it.* We are pushing on an open door.

Source of truth among the 5 files:
- **`index_5.html`** (MONAD landing) and **`StateFirst_Series.html`** (the
  library contract) are the clean, readable references — use these.
- The three `*_standalone*.html` are Superset exports (minified, asset hashes);
  treat them as visual reference only, not as code to port.

---

## 1. The final refinement — "Motion Frame" in three layers

A reusable system = three stacked layers, each shippable on its own.

### Layer A — Semantic tokens ("color = meaning")
The repo's tokens today are pure neutral greys (`oklch(... 0 0)`). The
prototypes' whole thesis is that **color carries meaning**. We **add** a
semantic layer on top of the shadcn neutrals (never replace them):

| Token | Meaning (one job) | Source palette |
| --- | --- | --- |
| `--sf-state` | a neutral state node | ink / neutral |
| `--sf-target`, `--sf-verified` | the target & a passed validator | green |
| `--sf-transition`, `--sf-event` | work in motion, an event firing | orange |
| `--sf-accent` | "the new pose becomes clear" / interactive highlight | electric blue |
| `--sf-fail`, `--sf-gap` | a failing validator, an incomplete monad | muted amber |
| `--sf-friction` | HOW-first noise, rework, the old pose | grey hatch (never glows) |

> **Decision #1 (needs ratifying):** MONAD uses green+orange expressively;
> the Series contract uses one electric blue + amber-fail. The recommendation
> is a **multi-hue but disciplined** palette (above): expressive enough to be
> "разноцветное", but every hue has exactly one job ("color = meaning"). Pick
> final OKLCH values in the design pass.

### Layer B — Motion primitives (`@rox/ui/motion`)
Port `lib/motion.js` (`travel`, `onInView`, `segmented`) and the Series motion
conventions into React primitives over `motion/react` (already a dep). **One
vocabulary, one import site** — honoring the team's anti-fragmentation note.

| Prototype mechanic | Motion Frame primitive | Built on |
| --- | --- | --- |
| `M.travel(path, dot)` signal along a rail | `<SignalTravel path>` | `offset-path` + `motion` |
| `M.onInView` | `<Reveal>` / `<Stagger>` | `whileInView` / `useInView` |
| segmented / switch / tabs glider | `<Segmented>` | `layoutId` |
| team → graph morph | `layoutId` shared-element | `motion` layout |
| pointer radial glow | `useGlow()` hook | `useMotionValue` + `useSpring` |
| spring feel | `springs.snap` = `{stiffness:280, damping:30}` | preset |
| **reduced motion** | `useReducedMotionSafe()` gates every primitive | `useReducedMotion` |

### Layer C — Concept components (`@rox/ui/circuit`)
The reusable diagram kit. These consume the **real domain types** from
`@rox/workflow-core`, which is what makes the system reusable rather than
decorative:

- Atoms: `<StateNode>`, `<TargetState>`, `<TransitionRail>`, `<EventPulse>`,
  `<MonadCapsule>`, `<ValidatorGate>`, `<TraceLine>`.
- **Keystone:** `<CircuitCanvas spec={ExecutionCircuitSpec} />` — renders *any*
  circuit spec with the prototype's motion. This is the single component the
  Execution Circuit UI, docs, and "explain a concept" surfaces all reuse.
- Showcase scenes: `<DeltaDecomposition>`, `<RefocusLens>`, `<TargetGravity>`,
  `<MotionGrid>` (the looping icon set for docs/marketing).

---

## 2. How to choose the goal & set the task (State-First, applied to itself)

Use the method on the work itself — this is the template for *every* task.

- **S₀ (current):** bare read-only circuit panel; neutral-only tokens;
  `motion`/`framer-motion` used ad-hoc in 194 places; prototypes are dead HTML.
- **S\* (target, verified):** `@rox/ui/motion` + `@rox/ui/circuit` shipped;
  `<CircuitCanvas>` renders a real `ExecutionCircuitSpec`; `ExecutionCircuitPanel`
  re-skinned with it; semantic tokens in `globals.css` (light+dark, AA);
  `prefers-reduced-motion` respected everywhere; a gallery route exists; `bun
  run lint` and `typecheck` are green; existing circuit tests still pass.
- **Δ = S\* − S₀ → the transitions (the actual work items):**

| # | Transition | Validator (acceptance) | Runtime |
| --- | --- | --- | --- |
| T1 | Add semantic token layer | tokens resolve light+dark, contrast AA, shadcn neutrals untouched | `packages/ui/src/globals.css` |
| T2 | Motion primitives `@rox/ui/motion` | each primitive has a story; all gate on reduced-motion | `packages/ui/src/motion/` |
| T3 | Concept atoms (Layer C) | render purely from props; visual snapshot | `packages/ui/src/circuit/` |
| T4 | `<CircuitCanvas spec>` | renders the generated draft spec with no errors; deterministic layout | `packages/ui/src/circuit/` |
| T5 | Re-skin `ExecutionCircuitPanel` | generate-draft + copy-prompt behavior preserved; text selectable; tests pass | `apps/desktop` |
| T6 | Gallery route + `<MotionGrid>` icon set | route renders; icons reused in `apps/docs` | `apps/desktop` / `apps/docs` |

Each transition's **monad** = { context files above, runtime, the validator,
and a trace = the PR diff + its story page }. A transition isn't "done" when
code is written — it's done when its validator passes.

---

## 3. Who to send what — two different "Claudes", two jobs

### Brief A → Claude (design / Artifacts side, claude.ai)
> **Goal:** Reconcile 5 State-First prototypes into ONE canonical design-system
> contract I can hand to an engineer.
>
> **Attached:** `index_5.html` (MONAD landing) and `StateFirst_Series.html`
> (library contract) — these two are the source of truth. The three
> `*_standalone*.html` are Superset exports; use them as visual reference only.
>
> **Produce, as separate artifacts:**
> 1. **Tokens** — final semantic palette as CSS custom properties **and** JSON,
>    in OKLCH, with light + dark values and AA-contrast notes. One hue = one
>    job: state(neutral), target/verified(green), transition/event(orange),
>    accent(electric blue), fail/gap(amber), friction(grey-hatch, never glows).
> 2. **Type scale** — Inter (UI) + JetBrains Mono (tech labels: state ids, Δ,
>    `monad{…}`). Sizes/weights/letter-spacing as a table.
> 3. **Motion spec** — a one-table "one job per animation" vocabulary (travel,
>    reveal/stagger, segmented glider, layoutId morph, pointer glow, spring
>    280/30) + the `prefers-reduced-motion` rule.
> 4. **Component gallery** — ONE clean, un-minified HTML page showing the 8
>    atoms + CircuitCanvas + the showcase scenes, inheriting the tokens above.
>
> **Constraint:** near-monochrome, dark-first, color = meaning. Do not invent a
> sixth hue. This is a contract an engineer will translate to React 1:1.

### Brief B → Claude Code (the repo agent on `agisota/set`)
> **Goal:** Implement "Motion Frame" per `plans/20260608-motion-frame-design-system.md`.
> Read that plan first; also read `plans/20260608-ui-polish-motion-animation-notes.md`
> and honor its "one shared motion wrapper" rule.
>
> **Domain to render:** `packages/workflow-core/src/circuit/types.ts`
> (`ExecutionCircuitSpec`). **Thing to re-skin:**
> `apps/desktop/.../components/ExecutionCircuitPanel/ExecutionCircuitPanel.tsx`.
> **Visual contract:** the tokens + motion spec + gallery from Brief A.
>
> **Build in order T1→T6 (section 2). Each transition is its own PR-able slice.**
> Add exports to `@rox/ui`: `./motion`, `./motion/*`, `./circuit/*`.
>
> **Guardrails (non-negotiable):**
> - Tokens are **added** to `globals.css`; never modify the shadcn neutral tokens.
> - Use `motion/react` (already a dep in `@rox/ui`); do **not** add a new
>   animation dependency; do **not** scatter `motion.div` in feature code —
>   everything goes through `@rox/ui/motion`.
> - Every animation gates on `prefers-reduced-motion`.
> - Follow AGENTS.md co-location: `ComponentName/ComponentName.tsx` + `index.ts`
>   + co-located `.test`/`.stories`.
> - `@xyflow/react` (already a dep) is allowed for the graph/morph scenes.
> - Preserve `ExecutionCircuitPanel` behavior (generate draft, copy prompt) and
>   keep error/label text selectable (`select-text`).
> - `bun run lint` must exit 0 (warnings fail CI) and `bun run typecheck` green
>   before every push.

### Brief C → your orchestrating agent (the one-paragraph version)
> Goal + S₀/S\*/Δ from section 2, the six transitions, the two source HTML
> files, and the guardrails above. Drive T1→T6 as separate draft PRs; gate each
> on its validator; report the trace (PR link + story page) per transition.

---

## 4. File map

```
packages/ui/
├── src/globals.css                 # + semantic --sf-* token layer (T1)
├── src/motion/                      # Layer B (T2)
│   ├── springs.ts  useReducedMotionSafe.ts  useGlow.ts
│   ├── Reveal/  Stagger/  Segmented/  SignalTravel/
│   └── index.ts                     # → @rox/ui/motion
└── src/circuit/                     # Layer C (T3, T4)
    ├── StateNode/  TargetState/  TransitionRail/  EventPulse/
    ├── MonadCapsule/  ValidatorGate/  TraceLine/
    ├── CircuitCanvas/               # consumes @rox/workflow-core types
    ├── scenes/ (DeltaDecomposition, RefocusLens, TargetGravity, MotionGrid)
    └── index.ts                     # → @rox/ui/circuit/*

apps/desktop/.../ExecutionCircuitPanel/ExecutionCircuitPanel.tsx   # re-skin (T5)
apps/desktop (gallery route) + apps/docs (MotionGrid icons)        # (T6)
```

## 5. Open decisions to lock in the design pass
1. Final palette: multi-hue-disciplined (recommended) vs single-accent Series.
2. Display font: Inter/JetBrains (repo default, recommended) vs Bebas/Lekton
   (the Superset variant) for hero/marketing only.
3. Graph scenes: hand-rolled SVG vs `@xyflow/react` (recommended for team→graph).
