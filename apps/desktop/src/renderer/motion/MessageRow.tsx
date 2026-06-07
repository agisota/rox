import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { ease, motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

/**
 * Entrance wrapper for a chat message row. A newly rendered row fades and
 * slides up from `y=8`; already-present rows reflow smoothly via
 * `layout="position"` instead of jumping. Essential tier — when motion is off
 * (reduced-motion / `'off'` preference) it renders a plain `<div>` with no
 * motion props so the row simply appears.
 *
 * Pair with an `<AnimatePresence initial={false}>` so only NEW rows animate in;
 * existing rows keep their layout. The streaming row should pass
 * `isStreaming` — it drops `layout` to avoid per-token width/height thrash.
 *
 * Case 051 / PR-51. Reuses {@link motionDuration} + {@link ease} +
 * {@link useShouldAnimate}.
 */
export function MessageRow({
	messageId,
	isStreaming = false,
	children,
}: {
	messageId: string;
	isStreaming?: boolean;
	children: ReactNode;
}) {
	const animate = useShouldAnimate("essential");
	if (!animate) {
		return <div data-message-row={messageId}>{children}</div>;
	}
	return (
		<motion.div
			data-message-row={messageId}
			layout={isStreaming ? false : "position"}
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 4 }}
			transition={{ duration: motionDuration.base, ease: ease.standard }}
		>
			{children}
		</motion.div>
	);
}
