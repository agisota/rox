"use client";

import { SignalTravel } from "../../motion";
import {
	type CircuitSpec,
	orderStates,
	validateCircuitSpec,
} from "../CircuitSpec";
import { StateNode } from "../StateNode";
import { TransitionRail } from "../TransitionRail";

export interface CircuitCanvasProps {
	spec: CircuitSpec;
	className?: string;
}

const NODE_W = 132;
const NODE_H = 64;
const GAP = 84;
const PAD = 20;
const ROW_Y = 44;

/**
 * Renders any {@link CircuitSpec} as a State-First circuit: states on a rail,
 * directional transitions between them, the target state in the target hue, and
 * a signal travelling the spine. Validates the spec first and renders a legible
 * fallback (never throws) when a referenced state is missing. Layout is a pure
 * function of the spec, so the same spec always yields identical geometry.
 */
export function CircuitCanvas({ spec, className }: CircuitCanvasProps) {
	const errors = validateCircuitSpec(spec);
	if (errors.length > 0) {
		return (
			<div className={className} role="alert">
				<p className="font-medium text-sm" style={{ color: "var(--sf-fail)" }}>
					Invalid circuit spec
				</p>
				<ul className="mt-1 space-y-0.5">
					{errors.map((error) => (
						<li
							key={`${error.code}:${error.message}`}
							className="text-muted-foreground text-xs"
						>
							{error.message}
						</li>
					))}
				</ul>
			</div>
		);
	}

	const ordered = orderStates(spec);
	const xOf = new Map<string, number>();
	for (const [i, state] of ordered.entries()) {
		xOf.set(state.id, PAD + i * (NODE_W + GAP));
	}
	const width = PAD * 2 + ordered.length * NODE_W + (ordered.length - 1) * GAP;
	const height = ROW_Y * 2 + NODE_H;
	const centerY = ROW_Y + NODE_H / 2;
	const spineStart = PAD + NODE_W;
	const spineEnd = xOf.get(spec.targetState) ?? width - PAD;

	return (
		<svg
			className={className}
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-label={`Execution circuit from ${spec.initialState} to ${spec.targetState}`}
		>
			<title>{`Execution circuit from ${spec.initialState} to ${spec.targetState}`}</title>
			{spec.transitions.map((transition) => {
				const fromX = xOf.get(transition.from);
				const toX = xOf.get(transition.to);
				if (fromX === undefined || toX === undefined) {
					return null;
				}
				return (
					<TransitionRail
						key={transition.id}
						x1={fromX + NODE_W}
						y1={centerY}
						x2={toX}
						y2={centerY}
						label={transition.label ?? transition.id}
						active
					/>
				);
			})}
			{ordered.map((state) => {
				const variant =
					state.id === spec.targetState
						? "target"
						: state.id === spec.initialState
							? "current"
							: "default";
				return (
					<StateNode
						key={state.id}
						x={xOf.get(state.id) ?? PAD}
						y={ROW_Y}
						width={NODE_W}
						height={NODE_H}
						label={state.label ?? state.id}
						variant={variant}
					/>
				);
			})}
			<SignalTravel
				path={`M ${spineStart} ${centerY} H ${spineEnd}`}
				color="var(--sf-transition)"
				duration={2.4}
			/>
		</svg>
	);
}
