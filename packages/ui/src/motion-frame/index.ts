/**
 * Motion Frame — the motion-driven design-system layer.
 *
 * Four levels, composed bottom-up:
 *  1. tokens          — semantic "color as law" (`STATE_TOKEN`, `globals.css`)
 *                       plus the typeface themes (`TYPEFACE_THEMES`).
 *  2. governor        — `MotionFrameProvider` + `useMotionTier` gate all motion.
 *  3. primitives      — `FadeLift`, `PulseDot`, `TraceLine`, `Reveal`,
 *                       `LoopMarquee`.
 *  4. composites      — the concept vocabulary: `StateTransition`,
 *                       `SufficiencyPanel`, `EventTrace`, `RuntimeCard`,
 *                       `ManifestoBlock`.
 *
 * See `plans/motion-frame/PORT-BRIEF.md` for the full build plan.
 */

export {
	type EventStatus,
	EventTrace,
	type EventTraceProps,
	type TraceEvent,
} from "./EventTrace";
export {
	ManifestoBlock,
	type ManifestoBlockProps,
	type ManifestoLine,
} from "./ManifestoBlock";
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
	RuntimeCard,
	type RuntimeCardProps,
	type RuntimeMetric,
	type RuntimeStatus,
} from "./RuntimeCard";
export {
	type StateNode,
	StateTransition,
	type StateTransitionProps,
} from "./StateTransition";
export {
	SufficiencyPanel,
	type SufficiencyPanelProps,
} from "./SufficiencyPanel";
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
