export interface TransitionRailProps {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	label?: string;
	/** Draw in the active (transition) hue rather than the neutral hair color. */
	active?: boolean;
}

/**
 * A directional rail from one state to the next, with an arrowhead and an
 * optional label. Render inside an `<svg>`. Pure/presentational.
 */
export function TransitionRail({
	x1,
	y1,
	x2,
	y2,
	label,
	active = false,
}: TransitionRailProps) {
	const midX = (x1 + x2) / 2;
	const stroke = active ? "var(--sf-transition)" : "var(--border)";
	// The cubic rail ends horizontally (its last control point shares the
	// endpoint's y), so the end tangent runs midX → x2. Rotate the arrowhead
	// along it so backward (right→left) rails point the correct way.
	const arrowAngle = (Math.atan2(0, x2 - midX) * 180) / Math.PI;
	return (
		<g>
			<path
				d={`M${x1},${y1} C ${midX},${y1} ${midX},${y2} ${x2},${y2}`}
				fill="none"
				stroke={stroke}
				strokeWidth={1.6}
			/>
			<path
				d={`M${x2 - 8},${y2 - 5} l8,5 l-8,5`}
				fill="none"
				stroke={stroke}
				strokeWidth={1.4}
				strokeLinejoin="round"
				transform={`rotate(${arrowAngle} ${x2} ${y2})`}
			/>
			{label ? (
				<text
					x={midX}
					y={(y1 + y2) / 2 - 9}
					textAnchor="middle"
					fontSize={10}
					fontFamily="var(--font-mono, ui-monospace, monospace)"
					fill="var(--muted-foreground)"
				>
					{label}
				</text>
			) : null}
		</g>
	);
}
