# Rox Motion Language

The single source of visual-motion truth for Rox (web · desktop · mobile shells).
Built on [`motion`](https://motion.dev) (`12.x`, the Framer-Motion successor,
imported as `motion/react`). This document is the human-readable contract; the
machine-readable guard is `tokens.contract.test.ts`.

> **Append-only lane.** Both `tokens.ts` and the `index.ts` barrel are an
> append-only, cross-area serialization lane. Later cases ADD presets/primitives;
> they NEVER remove or repurpose an existing token. `tokens.contract.test.ts`
> fails any PR that drops a frozen key.

---

## Two layered systems

There are two distinct motion systems under `packages/ui/src`. They are NOT
competitors — pick by surface.

### (A) `motion/` — the app-shell motion kit (consumed today)

The one apps actually use. Desktop is the primary consumer (20+ imports).

- **Tokens** (`motion/tokens.ts`)
  - `motionDuration` — `fast 0.12s` / `base 0.2s` / `slow 0.32s`.
  - `motionSpring` — 9 named springs: `soft`, `snappy`, `panel`, `pop`,
    `sidebarCollapse`, `layout`, `gentle`, `badge`, `bouncy`. Each annotated with
    its originating case/PR.
  - `ease` — `standard` `[0.2,0,0,1]` and `emphasized` `[0.3,0,0,1]`.
  - Shared variants — `shellBootVariants` (staggered first-mount shell entrance),
    `shakeVariants` / `motionShake` (error shakes).
- **Shared transitions / variants** (`motion/variants.ts`) — `staggerContainer` /
  `staggerItem` (list entrance), `portBadgeEnter` / `portNumberSpring` /
  `openButtonPulse` (port discovery).
- **Primitives** (~45 files) — `AnimatedHeight`, `AnimatedNumber`,
  `AnimatedPresence`, `MotionList`, `MotionPressable`, `MotionRoot`,
  `MotionToast`, `PopIn`, `Pressable`, `SpinnerRing`, `StreamingShimmer`,
  `ThinkingDots`, `ToolCardMotion`, `RouteTransition`, … (full list in
  `motion/index.ts`).

#### The accessibility governor (governor-A) — `useMotionPreference.ts`

The heart of the language.

- A 3-state preference `"full" | "essential" | "off"` crossed with a 2-tier
  classification `"essential" | "decorative"`.
- Every primitive calls `useShouldAnimate(tier)` and renders its **final state
  instantly** when it returns `false`.
- OS `prefers-reduced-motion` always clamps down to `essential`.
- **Injected-source contract.** The kit MUST NOT import any app store. The host
  injects its persisted preference exactly once at startup via
  `setMotionPreferenceSource({ getSnapshot, subscribe })`, wired through
  `useSyncExternalStore`. A Zustand store wires in with no adapter
  (`getState`/`subscribe`). Desktop does this at boot
  (`apps/desktop/src/renderer/index.tsx`, from `useSettings.animationPreference`).
- `useShouldAnimate(tier)` — its signature is **FROZEN**; non-hook twins
  `motionPreference()` / `shouldAnimate()` exist for imperative call sites.

### (B) `motion-frame/` — the motion-driven design-system layer (richer; not yet app-consumed)

Self-described as four bottom-up levels:

1. **tokens** — semantic "color as law": `STATE_TOKEN`
   (`transition`/`verified`/`noise` → `--state-*` CSS vars) + `TYPEFACE_THEMES`.
2. **governor (governor-B)** — `MotionFrameProvider` + `useMotionTier`. A second,
   parallel governor with its own tier model `"off" | "essential" | "full"` and a
   `capabilities` object `{ entrance, loop, transition }`. Persists to
   `localStorage["rox-motion-tier"]`; clamps for reduced motion. This is a
   React-context provider with its OWN storage — a different mechanism than the
   governor-A injectable source.
3. **primitives** — `FadeLift`, `PulseDot`, `TraceLine`, `Reveal`,
   `LoopMarquee` (`PulseDot` gates its loop on `capabilities.loop`).
4. **composites** — `StateTransition`, `SufficiencyPanel`, `EventTrace`,
   `RuntimeCard`, `ManifestoBlock`, plus `TypefaceThemeProvider`/`Switcher` and
   `MotionTierSwitcher`.

---

## Which governor to use

| Surface | Governor | Gate |
|---|---|---|
| Shell primitives, app chrome, **realtime presence/cursor UI** | **A** | `useShouldAnimate(tier)` |
| `motion-frame` design-system composites (when an app adopts the provider) | **B** | `useMotionTier()` → `capabilities` |

> **Duality caveat.** governor-A and governor-B have overlapping but
> non-identical tier vocabularies. `motion-frame` is unconsumed by any app today.
> Shared realtime UI (`@rox/collab` presence, `@rox/rtc` voice) uses **governor-A
> only** so it works in any app shell without requiring `MotionFrameProvider`.
> `PresenceStack` therefore renders its "live" pulse via `useShouldAnimate`
> (governor-A), not the governor-B `PulseDot`, to stay self-contained.

---

## Exports

`@rox/ui/motion` → `motion/index.ts` · `@rox/ui/motion-frame` →
`motion-frame/index.ts`. Consume as
`import { motionSpring, useShouldAnimate } from "@rox/ui/motion"`.

## Realtime UI reuse (collab/RTC)

`@rox/collab` (LiveBlocks presence/cursors) and `@rox/rtc` (LiveKit voice) reuse
this language so realtime UI feels native, not bolted on:

- Cursor / presence easing → `motionSpring.soft` and `ease.standard`.
- Avatar-stack entrance → `staggerItem`.
- "Live" indicator → a governor-A-gated pulse (see `PresenceStack`).

No realtime feature introduces a parallel motion vocabulary; it composes the
tokens above.
