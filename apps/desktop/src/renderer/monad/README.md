# MONAD

The design-system + motion library for the desktop renderer. **Framer Motion
only.** Graphite / green / orange palette, three font themes, restrained
desktop-grade motion that always respects the user's motion preference.

## Semantic colour law

| Token                  | Meaning                          |
| ---------------------- | -------------------------------- |
| graphite (`--monad-bg`, surfaces, text) | base / resting state |
| `--monad-transition` (orange) | active transition / in-flight |
| `--monad-verified` (green)    | verified / target / done      |

All tokens are scoped under `[data-monad-root]` (see `tokens.css`) and are
rendered by `MonadThemeProvider`, so MONAD never touches the product's `:root`
or its theme store.

## Foundation (PR-00)

```tsx
import {
  MonadThemeProvider,
  FontProvider,
  FontSwitcher,
  useMotionPreference,
  AnimatedHeight,
  Pressable,
  StatusPulse,
  AnimatedNumber,
  MotionList,
  springs,
} from "renderer/monad";

<MonadThemeProvider>
  <FontProvider>
    {/* MONAD surfaces + <FontSwitcher /> */}
  </FontProvider>
</MonadThemeProvider>;
```

- **`motion/tokens.ts`** — spring vocabulary (`soft` / `snap` / `loose` /
  `signal`), eases, durations.
- **`motion/useMotionPreference`** — `full` / `essential` / `off`, folded with
  the OS `prefers-reduced-motion`. Returns `{ reduced, disabled, … }`.
- **Motion helpers** — `AnimatedHeight`, `Pressable`, `StatusPulse`,
  `AnimatedNumber`, `MotionList`.
- **Providers** — `MonadThemeProvider` (token scope + dark/light), `FontProvider`
  (`data-font` on the document root) + `FontSwitcher`.

## Rules

- Animate **opacity / transform / layout** only. Never animate xterm rows,
  CodeMirror rows, or large virtualized lists.
- Resting state is always visible — entrances are transform-based, never
  clock-dependent opacity.
- Gate every animation on `useMotionPreference`; loops idle off when unneeded.
- Reuse a helper when a pattern appears ≥2×; don't over-abstract.

## Fonts

The font stacks degrade gracefully to bundled/system fonts. To light up the
exact typefaces, add and import the @fontsource packages:

```
bun add @fontsource/victor-mono @fontsource/bebas-neue @fontsource/lekton --cwd apps/desktop
```

## Roadmap

| PR     | Scope                                              |
| ------ | -------------------------------------------------- |
| **00** | Motion + design-system foundation (this)           |
| 01     | Primitives (`StateNode`, `TransitionEdge`, …)      |
| 02     | Composite screens + `/monad` gallery               |
| 03–14  | Bind primitives to real product surfaces           |
