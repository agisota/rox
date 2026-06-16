import { cn } from "../../lib/utils";

export type ProfileStat = {
	key: string;
	label: string;
	value: string;
};

export type ProfileStatsGridProps = {
	stats: ProfileStat[];
	className?: string;
};

/**
 * Compact, cross-platform stats strip used on the public profile and the
 * desktop Account page. Purely presentational — callers format values.
 */
export function ProfileStatsGrid({ stats, className }: ProfileStatsGridProps) {
	if (stats.length === 0) return null;

	return (
		<div
			className={cn(
				"grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5",
				className,
			)}
		>
			{stats.map((stat) => (
				<div key={stat.key} className="rounded-lg border bg-card p-4">
					<div className="text-xs text-muted-foreground">{stat.label}</div>
					<div className="mt-1 text-xl font-medium tabular-nums">
						{stat.value}
					</div>
				</div>
			))}
		</div>
	);
}
