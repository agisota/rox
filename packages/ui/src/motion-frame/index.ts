/**
 * Motion Frame — the motion-driven design-system layer.
 *
 * Four levels, composed bottom-up:
 *  1. tokens          — semantic "color as law" (`STATE_TOKEN`, `globals.css`).
 *  2. governor        — `MotionFrameProvider` + `useMotionTier` gate all motion.
 *  3. primitives      — `FadeLift`, `PulseDot`, `TraceLine`.
 *  4. composites      — `StateTransition` (concept vocabulary).
 *
 * See `plans/motion-frame/PORT-BRIEF.md` for the full build plan.
 */

export type {
	MotionCapabilities,
	MotionFrameContextValue,
	MotionFrameProviderProps,
	MotionTier,
} from "./MotionFrameProvider";
export {
	MotionFrameContext,
	MotionFrameProvider,
} from "./MotionFrameProvider";
export {
	MotionTierSwitcher,
	type MotionTierSwitcherProps,
} from "./MotionTierSwitcher";
export { FadeLift, type FadeLiftProps } from "./primitives/FadeLift";
export {
	LoopMarquee,
	type LoopMarqueeProps,
} from "./primitives/LoopMarquee";
export { PulseDot, type PulseDotProps } from "./primitives/PulseDot";
export { Reveal, type RevealProps } from "./primitives/Reveal";
export { TraceLine, type TraceLineProps } from "./primitives/TraceLine";
export {
	type StateNode,
	StateTransition,
	type StateTransitionProps,
} from "./StateTransition";
export {
	TypefaceThemeContext,
	type TypefaceThemeContextValue,
	TypefaceThemeProvider,
	type TypefaceThemeProviderProps,
	useTypefaceTheme,
} from "./TypefaceThemeProvider";
export {
	TypefaceThemeSwitcher,
	type TypefaceThemeSwitcherProps,
} from "./TypefaceThemeSwitcher";
export {
	STATE_TOKEN,
	type StateTokenName,
	TYPEFACE_THEMES,
	type TypefaceTheme,
} from "./tokens";
export { useMotionTier } from "./useMotionTier";
