import { motion } from "motion/react";
import { motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

export interface HighlightFlashProps {
	/** Full text to render. */
	text: string;
	/** Active search query; the first case-insensitive match flashes once. */
	query: string;
}

/**
 * One-shot color flash on the matched substring of `text`. Used by search
 * surfaces (case 029) to draw the eye to the term that matched as results
 * stream in. Color-only (background fades from `--accent` to transparent) —
 * no transform, no layout, so it cannot reflow or fight truncation.
 *
 * Renders plain text (no <mark>) when motion is disabled or the query is empty,
 * so reduced-motion users see no movement and unfiltered lists are untouched.
 */
export function HighlightFlash({ text, query }: HighlightFlashProps) {
	const shouldAnimate = useShouldAnimate();
	const trimmed = query.trim();

	if (!shouldAnimate || trimmed === "") {
		return <>{text}</>;
	}

	const matchIndex = text.toLowerCase().indexOf(trimmed.toLowerCase());
	if (matchIndex === -1) {
		return <>{text}</>;
	}

	const before = text.slice(0, matchIndex);
	const match = text.slice(matchIndex, matchIndex + trimmed.length);
	const after = text.slice(matchIndex + trimmed.length);

	return (
		<>
			{before}
			<motion.mark
				className="bg-transparent text-inherit rounded-[2px]"
				initial={{ backgroundColor: "var(--accent)" }}
				animate={{ backgroundColor: "rgba(0,0,0,0)" }}
				transition={{ duration: motionDuration.slow, ease: "easeOut" }}
			>
				{match}
			</motion.mark>
			{after}
		</>
	);
}
