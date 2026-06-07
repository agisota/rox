import type { ReactNode } from "react";
import { MotionList } from "../../motion/MotionList";

export type TraceTone = "default" | "muted" | "signal" | "verified";

export interface TraceLine {
	id: string;
	text: ReactNode;
	tone?: TraceTone;
}

export interface TraceStreamProps {
	lines: TraceLine[];
	className?: string;
}

const TONE_COLOR: Record<TraceTone, string> = {
	default: "var(--monad-text)",
	muted: "var(--monad-text-faint)",
	signal: "var(--monad-transition)",
	verified: "var(--monad-verified)",
};

/**
 * A monospaced stream of trace events. New lines enter with a transform-only
 * stagger via MotionList; reduced/disabled motion appends them at rest. Keep
 * the line set modest — this is not a virtualized log surface.
 *
 * Lands on: chat message list / trace console (PR-06).
 */
export function TraceStream({ lines, className }: TraceStreamProps) {
	return (
		<MotionList
			className={className}
			itemClassName="font-[family-name:var(--monad-font)]"
		>
			{lines.map((line) => (
				<div
					key={line.id}
					style={{
						display: "flex",
						gap: 8,
						padding: "2px 0",
						fontSize: 12.5,
						lineHeight: 1.5,
						color: TONE_COLOR[line.tone ?? "default"],
					}}
				>
					<span aria-hidden style={{ color: "var(--monad-text-faint)" }}>
						›
					</span>
					<span>{line.text}</span>
				</div>
			))}
		</MotionList>
	);
}
