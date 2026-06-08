# Motion Frame — Port Brief

Turn the one-off "concept page" artifacts from the Rox Design canvas (State-First
and siblings) into a **reusable, motion-driven design-system layer** in
`packages/ui`, then consume it across the product to visualize concepts and
explanations.

The insight: the diagram engines already exist in `packages/ui`
(`motion`, `@xyflow/react`, `recharts`, `@streamdown/mermaid`, `shiki`,
`mesh-gradient`). What is missing is **one unifying language** (tokens + motion
governor + typeface themes) and **a vocabulary of concept components**. That
language is the deliverable — not another page.

---

## Target state (S✷)

`@rox/ui/motion-frame` exists and any concept explainer is assembled from it:

- semantic state tokens drive all color ("color as law"), no hardcoded hex;
- a single `MotionFrameProvider` gates every animation via `full | essential |
  off` and always respects `prefers-reduced-motion`;
- transform-only entrances keep a "clock-safe resting state": content is always
  visible, even with motion off or no JS;
- primitives (`FadeLift`, `PulseDot`, `TraceLine`) and composites
  (`StateTransition`, then `SufficiencyPanel`, `EventTrace`, `RuntimeCard`,
  `ManifestoBlock`) cover the recurring concept shapes;
- diagram adapters wrap the existing engines so they inherit the same tokens and
  motion governor;
- a living showcase route in `apps/docs` renders the gallery.

## Sufficiency (the task is only "set" when all four are filled)

- **CONTEXT** — this brief; the Design canvas PORT SPEC (token map + motion
  spec + component inventory); `packages/ui/src/globals.css`; `AGENTS.md`
  (structure + lint rules).
- **TOOLS** — `motion` (12.38.0), `@xyflow/react`, `recharts`,
  `@streamdown/mermaid`, `shiki`, `mesh-gradient` — all already in
  `packages/ui` deps. No new animation engine.
- **RIGHTS** — edit `packages/ui` and the showcase in `apps/docs`. Do NOT touch
  production surfaces in `apps/web`. Do NOT touch the production database.
- **CRITERIA** — see Acceptance below.

## Acceptance (every PR)

- Tokens only; hex/oklch literals are forbidden inside components (values live in
  `globals.css`).
- All motion routes through `MotionFrameProvider` / `useMotionTier`; nothing
  loops in `essential`; nothing animates in `off`; `prefers-reduced-motion`
  clamps to at most `essential`.
- Co-location per `AGENTS.md`: `ComponentName/ComponentName.tsx` + `index.ts`,
  one component per file, tests co-located (`*.test.tsx`, `bun:test` +
  `renderToStaticMarkup`).
- `bun run lint` exits 0 (Biome treats warnings as errors), `bun run typecheck`
  green.
- No `.stories.tsx`: storybook is not installed in this repo. The showcase route
  in `apps/docs` is the living gallery instead.

---

## Build sequence (one level per PR — do not start N+1 until N is green)

1. **Tokens + governor** — `--state-transition|verified|noise` in `globals.css`
   (+ Tailwind utilities via `@theme inline`); `MotionFrameProvider` +
   `useMotionTier`. _(scaffolded — see Status.)_
2. **Primitives** — `FadeLift`, `PulseDot`, `TraceLine`, then `Reveal`,
   `LoopMarquee` (viewport-gated). _(first three scaffolded.)_
3. **Typeface themes** — Blueprint / Brutalist / Docs font themes as CSS vars +
   a persisted switcher (`layoutId`-style pill), mirroring the artifact.
4. **Concept composites** — `StateTransition` (scaffolded), then
   `SufficiencyPanel` (context/tools/rights/criteria), `EventTrace`
   (event.received / diff.written / validator.passed), `RuntimeCard`,
   `ManifestoBlock`.
5. **Diagram adapters** — thin wrappers over `@xyflow/react` (graphs / state
   machines), `recharts` (charts), `mermaid` (text-authored flows), `shiki`
   (trace/diff blocks) that inherit tokens + the motion governor.
6. **Showcase** — a route in `apps/docs` that renders every primitive and
   composite across all three tiers and both color themes.

---

## Who does what

- **Claude Design (canvas)** — produces the *reference render* and the *PORT
  SPEC* (token map, motion spec, component inventory with props). It does not
  author `.tsx` in this monorepo.
- **Claude Code (coding agent)** — turns the spec into real components here:
  tokens, tests, exports, green lint/typecheck. Follows the spec; does not
  invent design.
- **Orchestrator** — owns this plan: slices into the 6 PRs above, sequences
  them, enforces Acceptance, reviews each PR. Owns *what*, not *how*.

### Prompt to send Claude Design

> Don't make a new page. Produce a PORT SPEC to port into `packages/ui`. Output
> markdown: (1) Token map — every color/shadow/radius → a semantic name
> (`--state-transition|verified|noise`, font themes), no hex. (2) Motion spec —
> for each motion: trigger, transform, duration/easing, and behavior in
> full/essential/off + reduced-motion. (3) Component inventory — primitives and
> composites (StateTransition, SufficiencyPanel, EventTrace, RuntimeCard,
> ManifestoBlock) with props. (4) A reference render per composite (static frame
> + loop description). Goal: the coding agent rebuilds it from tokens without
> guessing values.

### Prompt to send Claude Code

> S✷: `packages/ui/src/motion-frame` exists and any explainer composes from it.
> CONTEXT: this brief + the Design PORT SPEC + `globals.css` + `AGENTS.md`.
> TOOLS: motion, @xyflow/react, recharts, mermaid, shiki — already in deps.
> RIGHTS: edit `packages/ui` (+ showcase in `apps/docs`); never `apps/web` prod.
> CRITERIA: tokens-only; governor gates full/essential/off + reduced-motion;
> co-location per AGENTS.md; `bun run lint` == 0; typecheck green; diagrams are
> adapters over existing libs. ORDER: tokens → governor → primitives →
> composites → adapters → showcase. One level per PR.

---

## Status

- [x] PR1 (partial): state tokens in `globals.css`; `MotionFrameProvider` +
      `useMotionTier`.
- [x] PR2 (partial): `FadeLift`, `PulseDot`, `TraceLine` + tests.
- [x] PR4 (seed): `StateTransition` composite + test.
- [ ] PR1 remainder: tier switcher UI, persistence QA.
- [ ] PR2 remainder: `Reveal`, `LoopMarquee`.
- [ ] PR3: typeface themes + switcher.
- [ ] PR4 remainder: `SufficiencyPanel`, `EventTrace`, `RuntimeCard`,
      `ManifestoBlock`.
- [ ] PR5: diagram adapters.
- [ ] PR6: `apps/docs` showcase.
