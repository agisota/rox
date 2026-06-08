/**
 * `@rox/ui/motion` — "Motion Frame" primitives.
 *
 * The cross-app shared motion vocabulary (built on `motion/react`) for the
 * State-First design system: reveals, staggers, the focus toggle, and the
 * signal-travel mechanic, plus shared spring tokens and the reduced-motion
 * gate. One import surface so motion stays legible and un-fragmented.
 */
export { Reveal, type RevealProps } from "./Reveal";
export {
	Segmented,
	type SegmentedOption,
	type SegmentedProps,
} from "./Segmented";
export { SignalTravel, type SignalTravelProps } from "./SignalTravel";
export { Stagger, type StaggerProps } from "./Stagger";
export { StaggerItem } from "./StaggerItem";
export { durations, springs } from "./springs";
export { useShouldAnimate } from "./useShouldAnimate";
