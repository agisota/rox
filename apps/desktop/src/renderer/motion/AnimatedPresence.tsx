/**
 * Re-export of framer-motion's `AnimatePresence` so consumers can pull presence
 * animation from the motion kit alongside the other primitives. Also aliased as
 * `AnimatedPresence` for call sites that prefer the kit's naming.
 */

export type { AnimatePresenceProps } from "framer-motion";
export {
	AnimatePresence,
	AnimatePresence as AnimatedPresence,
} from "framer-motion";
