/**
 * MONAD — the design-system + motion library for the desktop app.
 *
 * Engine: Framer Motion only. Palette: graphite / green / orange (tokens.css).
 * Fonts: Blueprint / Brutalist / Terminal via FontProvider. Every component
 * respects `useMotionPreference` and keeps its resting state fully visible.
 *
 * This barrel re-exports the PR-00 foundation (motion primitives + providers)
 * and the PR-01 primitives. Composites (PR-02) land under ./composites.
 */

export * from "./motion";
export * from "./primitives";
export * from "./providers";
