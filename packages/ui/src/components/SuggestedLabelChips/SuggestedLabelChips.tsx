"use client";

import { AnimatePresence, motion } from "motion/react";

import { cn } from "../../lib/utils";
import { ease, motionDuration } from "../../motion/tokens";
import { useShouldAnimate } from "../../motion/useMotionPreference";
import { deriveSuggestedChips, suggestedLabelColor } from "./suggested-labels";

export interface SuggestedLabelChipsProps {
	/** Raw suggestions from `chat.generateLabelsFromTranscript`. */
	suggestions: readonly string[];
	/** Labels already applied to the session (`chat_sessions.labels`). */
	appliedLabels: readonly string[];
	/** Names the user dismissed this session (drives ghost-chip hide). */
	dismissed: readonly string[];
	/** Accept a chip → add to `chat.labels` membership (`chat.setLabels`). */
	onAccept: (name: string) => void;
	/** Dismiss a chip → add to the session's `dismissed` set. */
	onDismiss: (name: string) => void;
	className?: string;
}

/** Ghost-chip chrome: dashed outline + muted text until accepted. */
const GHOST_CHIP_BASE =
	"group inline-flex items-center gap-1.5 rounded-full border border-dashed border-border/70 bg-transparent px-2.5 py-0.5 text-xs font-medium text-muted-foreground whitespace-nowrap shrink-0 transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * AI-suggested label ghost-chips under the chat input (Hermes-borrow F14).
 *
 * On a chat settling, the server proposes ≤3 short topical tags (the auto-title
 * sibling, organization axis). They render here as dismissible dashed ghost-chips:
 * the chip body accepts the label (writes membership via the platform's
 * `chat.setLabels` wiring), the trailing `×` dismisses it. Reconcile against the
 * session's applied + dismissed labels happens in {@link deriveSuggestedChips},
 * so an already-applied (manual or accepted) tag is never re-shown and the
 * manual override is respected.
 *
 * Calm cross-fade through the motion governor: each chip fades/slides in and out
 * via `AnimatePresence`, gated on `useShouldAnimate('decorative')` so a
 * reduced-motion / motion-off user gets the final state instantly (no entrance,
 * no exit animation). All data flows in via props and mutations flow out via
 * callbacks, so the same component drives web, desktop, and mobile from one core
 * (the platform owns the tRPC wiring).
 */
export function SuggestedLabelChips({
	suggestions,
	appliedLabels,
	dismissed,
	onAccept,
	onDismiss,
	className,
}: SuggestedLabelChipsProps) {
	const shouldAnimate = useShouldAnimate("decorative");
	const chips = deriveSuggestedChips({ suggestions, appliedLabels, dismissed });

	if (chips.length === 0) {
		return null;
	}

	return (
		<ul
			className={cn(
				"flex list-none flex-wrap items-center gap-1.5 p-0",
				className,
			)}
			aria-label="Предложенные теги"
		>
			<AnimatePresence initial={shouldAnimate}>
				{chips.map((name) => (
					<motion.li
						key={name}
						layout={shouldAnimate}
						initial={shouldAnimate ? { opacity: 0, scale: 0.92 } : false}
						animate={{ opacity: 1, scale: 1 }}
						exit={shouldAnimate ? { opacity: 0, scale: 0.92 } : { opacity: 1 }}
						transition={{
							duration: motionDuration.base,
							ease: ease.standard,
						}}
						className={GHOST_CHIP_BASE}
					>
						<button
							type="button"
							className="inline-flex items-center gap-1.5 focus-visible:outline-none"
							onClick={() => onAccept(name)}
							title={`Принять тег «${name}»`}
						>
							<span
								aria-hidden
								className="size-1.5 rounded-full"
								style={{ backgroundColor: suggestedLabelColor(name) }}
							/>
							{name}
						</button>
						<button
							type="button"
							className="ml-0.5 rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
							onClick={() => onDismiss(name)}
							aria-label={`Скрыть тег «${name}»`}
							title={`Скрыть тег «${name}»`}
						>
							×
						</button>
					</motion.li>
				))}
			</AnimatePresence>
		</ul>
	);
}
