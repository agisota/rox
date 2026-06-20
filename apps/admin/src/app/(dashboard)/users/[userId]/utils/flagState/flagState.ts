/**
 * Pure helpers for the per-user feature-flag toggle UI (WS-F T7).
 *
 * The DB override is a tri-state: `true` (force-on), `false` (force-off), or
 * `null` (inherit → PostHog decides). The UI surfaces this as a 3-way control,
 * so these helpers map between the override value and a discrete UI state and
 * back. Pure + side-effect-free → unit-testable under `bun test` (no React).
 */

export type FlagOverrideState = "on" | "off" | "inherit";

/** Map a DB override value to the discrete UI state. */
export function overrideToState(override: boolean | null): FlagOverrideState {
	if (override === true) return "on";
	if (override === false) return "off";
	return "inherit";
}

/** Map a discrete UI state back to the override value `setUserFlag` expects. */
export function stateToOverride(state: FlagOverrideState): boolean | null {
	if (state === "on") return true;
	if (state === "off") return false;
	return null;
}

/** Cycle on → off → inherit → on (the FlagToggleRow click order). */
export function nextFlagState(state: FlagOverrideState): FlagOverrideState {
	if (state === "on") return "off";
	if (state === "off") return "inherit";
	return "on";
}

/** Human label for the badge shown next to a flag. */
export function effectiveLabel(effective: boolean): string {
	return effective ? "Enabled" : "Disabled";
}
