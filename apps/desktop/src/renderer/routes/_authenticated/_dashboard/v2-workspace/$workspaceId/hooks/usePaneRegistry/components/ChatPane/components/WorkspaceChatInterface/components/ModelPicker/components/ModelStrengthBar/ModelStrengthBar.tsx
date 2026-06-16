import { cn } from "@rox/ui/utils";

interface ModelStrengthBarProps {
	/** 0-100 capability/power score. */
	strength: number;
	className?: string;
}

// Stair-step segments (id + height) so the bar reads as a chart, not a meter.
// Stable ids keep React keys off the array index.
const SEGMENTS = [
	{ id: "s1", heightClass: "h-1" },
	{ id: "s2", heightClass: "h-1.5" },
	{ id: "s3", heightClass: "h-2" },
	{ id: "s4", heightClass: "h-2.5" },
	{ id: "s5", heightClass: "h-3" },
] as const;

/**
 * A compact 5-segment bar chart conveying a model's relative "power" at a
 * glance, so non-technical users can compare models without reading specs.
 * Filled segments scale with {@link ModelStrengthBarProps.strength}.
 */
export function ModelStrengthBar({
	strength,
	className,
}: ModelStrengthBarProps) {
	const clamped = Math.max(0, Math.min(100, strength));
	const filledSegments = Math.max(
		1,
		Math.round((clamped / 100) * SEGMENTS.length),
	);

	return (
		<div
			className={cn("flex items-end gap-0.5", className)}
			role="img"
			aria-label={`Мощность: ${clamped} из 100`}
			title={`Мощность ${clamped}/100`}
		>
			{SEGMENTS.map((segment, index) => {
				const filled = index < filledSegments;
				return (
					<span
						key={segment.id}
						className={cn(
							"w-0.5 rounded-full transition-colors",
							segment.heightClass,
							filled ? "bg-foreground/70" : "bg-foreground/15",
						)}
					/>
				);
			})}
		</div>
	);
}
