export interface StateNodeProps {
	/** X of the node's top-left, in the parent SVG's user units. */
	x: number;
	/** Y of the node's top-left, in the parent SVG's user units. */
	y: number;
	label: string;
	width?: number;
	height?: number;
	/** `current` = S₀, `target` = S\* (gravity), `default` = an in-between state. */
	variant?: "current" | "target" | "default";
}

const ID_BY_VARIANT = {
	current: "S₀",
	target: "S*",
	default: "S",
} as const;

/**
 * A single state in a circuit, drawn as a rounded node. Render inside an
 * `<svg>`. Pure/presentational — geometry comes from props, color from the
 * `--sf-*` semantic tokens.
 */
export function StateNode({
	x,
	y,
	label,
	width = 132,
	height = 64,
	variant = "default",
}: StateNodeProps) {
	const isTarget = variant === "target";
	return (
		<g>
			<rect
				x={x}
				y={y}
				width={width}
				height={height}
				rx={9}
				fill="var(--card)"
				stroke={isTarget ? "var(--sf-target)" : "var(--border)"}
				strokeWidth={isTarget ? 1.5 : 1}
			/>
			<text
				x={x + 14}
				y={y + 24}
				fontSize={11}
				letterSpacing="0.12em"
				fontFamily="var(--font-mono, ui-monospace, monospace)"
				fill={isTarget ? "var(--sf-target)" : "var(--muted-foreground)"}
			>
				{ID_BY_VARIANT[variant]}
			</text>
			<text x={x + 14} y={y + 46} fontSize={13} fill="var(--foreground)">
				{label}
			</text>
		</g>
	);
}
