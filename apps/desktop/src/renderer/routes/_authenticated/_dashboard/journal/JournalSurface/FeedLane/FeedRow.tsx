import type { SelectJournalEvent } from "@rox/db/schema";
import { StatusPulse } from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import { relativeTime } from "../datetime";
import { isLiveStatus, KIND_LABELS, statusDotClass } from "../status";
import { eventStatus } from "../types";

interface FeedRowProps {
	event: SelectJournalEvent;
	/** Pulse the dot when the row is freshly inserted (recency) or in-flight. */
	pulse: boolean;
	onOpen: (event: SelectJournalEvent) => void;
}

/**
 * One event in the feed, rendered as a glass card sitting on the continuous
 * timeline line. The line itself lives on the group container; the row only
 * draws its status node (the dot) so the line reads as unbroken across rows.
 */
export function FeedRow({ event, pulse, onOpen }: FeedRowProps) {
	const status = eventStatus(event);
	const live = pulse || isLiveStatus(status);

	return (
		<div className="relative pb-2 pl-9">
			{/* Status node on the timeline line (line is drawn by the group). */}
			<span className="absolute top-[1.15rem] left-[0.6875rem] flex size-3 items-center justify-center">
				<StatusPulse
					active={live}
					once={!isLiveStatus(status)}
					colorClassName={statusDotClass(status)}
					className="size-2.5 ring-2 ring-background"
				/>
			</span>

			<button
				type="button"
				onClick={() => onOpen(event)}
				className={cn(
					"group/row flex w-full items-start gap-3 rounded-lg border border-border/50 bg-card/40 p-3 text-left backdrop-blur-sm transition-colors",
					"hover:border-border hover:bg-card/60 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
				)}
			>
				<div className="min-w-0 flex-1">
					<div className="flex items-baseline justify-between gap-3">
						<span className="truncate font-medium text-foreground text-sm">
							{event.title}
						</span>
						<time className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
							{relativeTime(event.createdAt)}
						</time>
					</div>
					{event.summary && (
						<p className="mt-0.5 truncate text-muted-foreground text-xs">
							{event.summary}
						</p>
					)}
				</div>
				<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
					{KIND_LABELS[event.kind] ?? event.kind}
				</span>
			</button>
		</div>
	);
}
