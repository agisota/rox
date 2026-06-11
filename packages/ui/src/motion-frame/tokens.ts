/**
 * Semantic state tokens — the "color as law" layer of Motion Frame.
 *
 * Each name maps 1:1 to a CSS custom property declared in `globals.css`
 * (`--state-*`). Never hardcode hex/oklch inside components; reference these
 * tokens (or their generated Tailwind utilities like `text-state-verified`)
 * so the whole system can be re-themed from one place.
 */
export const STATE_TOKEN = {
	/** Energy of an in-flight transition (S₀ → S✷). Orange. */
	transition: "var(--state-transition)",
	/** A proven / verified end state (S✷). Green. */
	verified: "var(--state-verified)",
	/** Harness noise — logs, scaffolding, low-signal chrome. Grey. */
	noise: "var(--state-noise)",
} as const;

export type StateTokenName = keyof typeof STATE_TOKEN;
