"use client";

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { FadeLift } from "../primitives/FadeLift";
import { PulseDot } from "../primitives/PulseDot";
import type { StateTokenName } from "../tokens";

/** Lifecycle of a single traced event. */
export type EventStatus = "pending" | "active" | "done";

const STATUS_TOKEN: Record<EventStatus, StateTokenName> = {
	pending: "noise",
	active: "transition",
	done: "verified",
};

export interface TraceEvent {
	/** Stable identity for the row (also the React key). */
	id: string;
	/** Event name, e.g. `event.received`. */
	label: ReactNode;
	/** Optional secondary line — payload, timing, note. */
	detail?: ReactNode;
	/** Lifecycle status — selects the token color and the pulse. */
	status?: EventStatus;
}

export interface EventTraceProps {
	events: TraceEvent[];
	className?: string;
}

/**
 * A vertical timeline of pipeline events (`event.received` → `diff.written` →
 * `validator.passed`). Each step's dot reads its semantic token from its status:
 * `done` is verified (green), `active` is an in-flight transition (orange, and
 * pulses only in `full`), `pending` is noise (grey). Rows fade in with a small
 * per-index stagger, all gated by the governor so `off` / reduced-motion render
 * static and fully visible.
 */
export function EventTrace({ events, className }: EventTraceProps) {
	return (
		<ol className={cn("flex w-full flex-col", className)}>
			{events.map((event, index) => {
				const status = event.status ?? "pending";
				const isLast = index === events.length - 1;
				return (
					<li className="flex gap-3" data-event-status={status} key={event.id}>
						<div className="flex flex-col items-center">
							<PulseDot state={STATUS_TOKEN[status]} />
							{isLast ? null : (
								<span
									aria-hidden="true"
									className="my-1 w-px flex-1 bg-border"
								/>
							)}
						</div>
						<FadeLift
							className={cn("flex flex-col gap-0.5", isLast ? "" : "pb-4")}
							delay={index * 0.08}
						>
							<span className="font-mono text-foreground text-sm">
								{event.label}
							</span>
							{event.detail ? (
								<span className="text-muted-foreground text-xs">
									{event.detail}
								</span>
							) : null}
						</FadeLift>
					</li>
				);
			})}
		</ol>
	);
}
