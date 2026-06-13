"use client";

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { FadeLift } from "../primitives/FadeLift";
import { PulseDot } from "../primitives/PulseDot";
import type { StateTokenName } from "../tokens";

/** Live status of a runtime / agent. */
export type RuntimeStatus = "idle" | "running" | "ready";

const STATUS_TOKEN: Record<RuntimeStatus, StateTokenName> = {
	idle: "noise",
	running: "transition",
	ready: "verified",
};

const STATUS_LABEL: Record<RuntimeStatus, string> = {
	idle: "idle",
	running: "running",
	ready: "ready",
};

export interface RuntimeMetric {
	/** Stable identity for the metric (also the React key). */
	id: string;
	/** Short metric name. */
	label: ReactNode;
	value: ReactNode;
}

export interface RuntimeCardProps {
	/** Runtime / agent name. */
	name: ReactNode;
	/** Live status — drives the dot color and, in `full`, its pulse. */
	status?: RuntimeStatus;
	/** Key/value runtime facts rendered as a definition list. */
	metrics?: RuntimeMetric[];
	className?: string;
	children?: ReactNode;
}

/**
 * A card describing a single runtime / agent and its live status. The status
 * dot reads its token from the status — `running` → transition, `ready` →
 * verified, `idle` → noise — and pulses only in the `full` tier. Metrics render
 * as a definition list keyed by a stable `id`. The card fades in once via
 * `FadeLift`, so it is fully static under `off` / reduced-motion.
 */
export function RuntimeCard({
	name,
	status = "idle",
	metrics,
	className,
	children,
}: RuntimeCardProps) {
	return (
		<FadeLift
			className={cn(
				"w-full rounded-lg border border-border bg-card p-4 text-card-foreground",
				className,
			)}
		>
			<header
				className="flex items-center justify-between gap-2"
				data-runtime-status={status}
			>
				<span className="font-medium text-sm">{name}</span>
				<span className="flex items-center gap-2 text-muted-foreground text-xs">
					<PulseDot state={STATUS_TOKEN[status]} />
					{STATUS_LABEL[status]}
				</span>
			</header>
			{metrics && metrics.length > 0 ? (
				<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
					{metrics.map((metric) => (
						<div className="flex flex-col" key={metric.id}>
							<dt className="text-muted-foreground text-xs">{metric.label}</dt>
							<dd className="font-mono">{metric.value}</dd>
						</div>
					))}
				</dl>
			) : null}
			{children ? <div className="mt-3 text-sm">{children}</div> : null}
		</FadeLift>
	);
}
