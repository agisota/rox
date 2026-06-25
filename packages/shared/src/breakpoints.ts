/**
 * Responsive breakpoint tiers — shared core (F05, Hermes-borrow #639).
 *
 * The single, platform-agnostic source of truth for the shell's responsive
 * cascade. The 3-region shell (left rail | center panes | right context) does
 * not branch on an ad-hoc `isMobile` boolean per surface; instead every host
 * — desktop (lead), web, mobile — resolves the SAME viewport `width` into the
 * SAME tier and reads the SAME cascade rules from here. "Tablet on a narrow
 * desktop window = tablet on web = the tablet reflow" stays true the same way
 * the F56 zen core keeps the shell collapse portable.
 *
 * Why it lives in `@rox/shared` (and stays React-free / DOM-free): the React
 * binding (`useBreakpoint` in `@rox/ui`) and the React Native binding both feed
 * a measured `width` into {@link resolveTier} and render off {@link CascadeRules}.
 * Nothing here touches `window`, `matchMedia`, or React, so the tiers and rules
 * unit-test as plain functions and the contract is identical across platforms.
 *
 * Tiers (per catalog / GAP-MAP):
 * - `wide`   — `>= 901px`: full 3-region shell, right panel docked.
 * - `tablet` — `641–900px`: right panel becomes an overlay; rail + center stay.
 * - `phone`  — `<= 640px`: sidebar → slide-in drawer, right panel → slide-over,
 *               rail → hamburger, composer chips → one config button.
 *
 * Consumed by F56 (Zen) and F51 (gestures) as the one place tiers are defined.
 */

/** The three responsive tiers, widest → narrowest. */
export type BreakpointTier = "wide" | "tablet" | "phone";

/**
 * Inclusive lower bound (in CSS px) of each tier. A measured viewport width at
 * or above a tier's bound — and below the next one up — resolves to that tier.
 * Exposed so hosts can build matching media queries without re-deriving the
 * numbers (see {@link tierMediaQuery}).
 */
export const BREAKPOINTS = {
	/** `<= 640px` — phone tier (drawers). */
	phoneMax: 640,
	/** `>= 641px` — tablet tier lower bound (right panel overlay). */
	tabletMin: 641,
	/** `>= 901px` — wide tier lower bound (full docked shell). */
	wideMin: 901,
} as const;

/** Tiers ordered widest → narrowest. Stable for iteration / matrices. */
export const BREAKPOINT_TIERS: readonly BreakpointTier[] = [
	"wide",
	"tablet",
	"phone",
] as const;

/**
 * Resolve a measured viewport width (CSS px) into its tier. Pure and total:
 * any finite width maps to exactly one tier, with `wide` as the fallback for
 * non-finite input (SSR / pre-measure) so the shell renders fully-docked first
 * and only collapses once a real measurement arrives.
 */
export function resolveTier(width: number): BreakpointTier {
	if (!Number.isFinite(width)) return "wide";
	if (width <= BREAKPOINTS.phoneMax) return "phone";
	if (width < BREAKPOINTS.wideMin) return "tablet";
	return "wide";
}

/**
 * Per-tier cascade rules: the platform-neutral description of how each of the
 * three shell regions reflows at a given tier. Surfaces render off these flags
 * instead of re-encoding the breakpoint policy, so the desktop shell, the web
 * shell, and the RN shell can never drift apart.
 */
export interface CascadeRules {
	/** The tier these rules describe. */
	readonly tier: BreakpointTier;
	/**
	 * Left workspace sidebar: `docked` in-flow (wide), or `drawer` as a
	 * slide-in overlay reached via the rail hamburger (phone). Tablet keeps it
	 * docked — only the right panel overlays there.
	 */
	readonly sidebar: "docked" | "drawer";
	/**
	 * Right context panel: `docked` in-flow (wide), `overlay` floating over the
	 * canvas without reflowing it (tablet), or `slide-over` full-height sheet
	 * from the edge (phone). Reuses the F03 right-panel persisted state machine.
	 */
	readonly rightPanel: "docked" | "overlay" | "slide-over";
	/** Whether the left rail collapses to a hamburger trigger (phone only). */
	readonly railAsHamburger: boolean;
	/**
	 * Composer affordances: full inline `chips` (wide/tablet) or collapsed to a
	 * single `config-button` that opens the chip set in a sheet (phone).
	 */
	readonly composer: "chips" | "config-button";
}

const WIDE_RULES: CascadeRules = {
	tier: "wide",
	sidebar: "docked",
	rightPanel: "docked",
	railAsHamburger: false,
	composer: "chips",
};

const TABLET_RULES: CascadeRules = {
	tier: "tablet",
	sidebar: "docked",
	rightPanel: "overlay",
	railAsHamburger: false,
	composer: "chips",
};

const PHONE_RULES: CascadeRules = {
	tier: "phone",
	sidebar: "drawer",
	rightPanel: "slide-over",
	railAsHamburger: true,
	composer: "config-button",
};

/** Frozen rule set per tier. Stable identity so React callers don't re-render. */
export const CASCADE_RULES: Readonly<Record<BreakpointTier, CascadeRules>> = {
	wide: WIDE_RULES,
	tablet: TABLET_RULES,
	phone: PHONE_RULES,
};

/** The cascade rules for a tier. Stable reference — safe in dependency arrays. */
export function cascadeRulesFor(tier: BreakpointTier): CascadeRules {
	return CASCADE_RULES[tier];
}

/**
 * Build the CSS media query that is true exactly while the viewport sits in a
 * given tier. Hosts subscribe to these via `matchMedia` (web/desktop) so the
 * tier flips on resize without polling; the numbers come straight from
 * {@link BREAKPOINTS} so the query and {@link resolveTier} can never disagree.
 */
export function tierMediaQuery(tier: BreakpointTier): string {
	switch (tier) {
		case "phone":
			return `(max-width: ${BREAKPOINTS.phoneMax}px)`;
		case "tablet":
			return `(min-width: ${BREAKPOINTS.tabletMin}px) and (max-width: ${BREAKPOINTS.wideMin - 1}px)`;
		case "wide":
			return `(min-width: ${BREAKPOINTS.wideMin}px)`;
	}
}

/**
 * Minimum interactive touch target on the phone tier, in CSS px. Drawer
 * triggers, the rail hamburger, and the composer config button all size to at
 * least this on `phone` so the reflowed shell stays thumb-reachable (WCAG 2.5.5
 * / Apple HIG 44pt). Surfaces read this rather than hard-coding `44`.
 */
export const MIN_TOUCH_TARGET_PX = 44;

/**
 * Whether a tier is touch-first (phone). Helper so surfaces can opt into the
 * larger {@link MIN_TOUCH_TARGET_PX} hit areas and gesture-primary affordances
 * (F51) without re-checking the tier string at every call site.
 */
export function isTouchTier(tier: BreakpointTier): boolean {
	return tier === "phone";
}
