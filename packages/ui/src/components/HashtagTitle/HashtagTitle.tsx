"use client";

import { cn } from "../../lib/utils";
import {
	deriveHashtagTitleParts,
	type HashtagTitleSegment,
} from "./hashtag-title";

export interface HashtagTitleProps {
	/**
	 * The parsed title runs from `parseHashtagSegments(title)` in
	 * `@rox/chat/shared`. The host parses (it owns the chat client) and passes
	 * the segments, so `@rox/ui` renders chips without the chat server stack.
	 */
	segments: readonly HashtagTitleSegment[];
	/**
	 * Filter on a clicked tag (its canonical name without `#`). Omit to render
	 * the chips as inert text — the same title reads identically whether or not
	 * the host wires a filter.
	 */
	onSelectTag?: (tag: string) => void;
	/** Tag names that are currently active in the filter (accent-filled chips). */
	activeTags?: readonly string[];
	className?: string;
}

/** Chip chrome shared with the F10 tag pill-bar so both tag axes read alike. */
const CHIP_BASE =
	"inline-flex items-center rounded-full px-1.5 align-baseline text-[0.9em] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Render a chat title with its inline `#tags` as clickable, colour-hashed chips
 * (Hermes-borrow F13).
 *
 * Plain runs render verbatim; each `#tag` renders as a chip whose colour is
 * hashed from the tag name (shared with the F11/F24 auto-colour), so the same
 * tag is the same hue everywhere. Clicking a chip emits its canonical name via
 * `onSelectTag` — the host drops it into the live-filter / F10 pill axis. When
 * `onSelectTag` is omitted the chips are inert, so the title still reads
 * correctly anywhere the component is reused.
 *
 * Purely presentational and prop-driven, so the same contract drives web,
 * desktop, and (via an RN chip renderer) mobile from one core.
 */
export function HashtagTitle({
	segments,
	onSelectTag,
	activeTags,
	className,
}: HashtagTitleProps) {
	const parts = deriveHashtagTitleParts(segments);
	const active = activeTags ? new Set(activeTags) : undefined;

	return (
		<span className={cn("min-w-0", className)}>
			{parts.map((part) => {
				if (part.kind === "text") {
					return <span key={part.key}>{part.text}</span>;
				}

				const isActive = active?.has(part.tag) ?? false;

				// No handler → inert coloured chip (still readable, not focusable).
				if (!onSelectTag) {
					return (
						<span
							key={part.key}
							data-chip-tag={part.tag}
							className={cn(CHIP_BASE, "bg-muted text-muted-foreground")}
							style={{ color: part.color }}
						>
							{part.text}
						</span>
					);
				}

				return (
					<button
						key={part.key}
						type="button"
						data-chip-tag={part.tag}
						aria-pressed={isActive}
						title={`Filter by ${part.text}`}
						onClick={(event) => {
							// Avoid triggering an enclosing row's open/select handler.
							event.stopPropagation();
							onSelectTag(part.tag);
						}}
						className={cn(
							CHIP_BASE,
							"cursor-pointer hover:bg-muted",
							isActive
								? "bg-accent text-accent-foreground"
								: "text-muted-foreground",
						)}
						style={isActive ? undefined : { color: part.color }}
					>
						{part.text}
					</button>
				);
			})}
		</span>
	);
}
