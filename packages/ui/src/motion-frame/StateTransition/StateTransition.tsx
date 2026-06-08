"use client";

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { FadeLift } from "../primitives/FadeLift";
import { PulseDot } from "../primitives/PulseDot";
import { TraceLine } from "../primitives/TraceLine";
import type { StateTokenName } from "../tokens";

export interface StateNode {
	label: ReactNode;
	detail?: ReactNode;
}

export interface StateTransitionProps {
	/** Current state (S₀) — rendered with the `transition` token. */
	from: StateNode;
	/** Target state (S✷) — rendered with the `verified` token. */
	to: StateNode;
	className?: string;
}

function renderMarker(
	node: StateNode,
	state: StateTokenName,
	alignEnd: boolean,
) {
	return (
		<div
			className={cn(
				"flex flex-col gap-1",
				alignEnd ? "items-end text-right" : "items-start",
			)}
		>
			<span className="flex items-center gap-2 text-foreground text-sm">
				<PulseDot state={state} />
				{node.label}
			</span>
			{node.detail ? (
				<span className="text-muted-foreground text-xs">{node.detail}</span>
			) : null}
		</div>
	);
}

/**
 * The core concept composite: a labelled transition from a current state (S₀)
 * to a target state (S✷), wired through the shared primitives so it inherits
 * the active motion tier and the semantic state tokens.
 */
export function StateTransition({ from, to, className }: StateTransitionProps) {
	return (
		<FadeLift
			className={cn(
				"flex w-full items-center justify-between gap-4 font-mono",
				className,
			)}
		>
			{renderMarker(from, "transition", false)}
			<TraceLine className="flex-1" />
			{renderMarker(to, "verified", true)}
		</FadeLift>
	);
}
