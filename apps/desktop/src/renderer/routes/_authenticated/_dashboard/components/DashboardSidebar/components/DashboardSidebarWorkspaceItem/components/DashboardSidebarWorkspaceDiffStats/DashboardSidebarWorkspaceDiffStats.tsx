import { AnimatedNumber } from "renderer/monad/motion";

interface DashboardSidebarWorkspaceDiffStatsProps {
	additions: number;
	deletions: number;
	isActive?: boolean;
}

// Preserve the original plain-integer formatting (no locale separators) so the
// only visible change is the spring on value updates.
const formatCount = (value: number) => Math.round(value).toString();

export function DashboardSidebarWorkspaceDiffStats({
	additions,
	deletions,
	isActive,
}: DashboardSidebarWorkspaceDiffStatsProps) {
	return (
		<div className="flex h-5 w-fit shrink-0 items-center justify-self-end font-mono text-[10px] tabular-nums group-hover:hidden">
			<div className="flex items-center gap-1.5 leading-none">
				<span
					className={isActive ? "text-emerald-500/90" : "text-muted-foreground"}
				>
					+<AnimatedNumber value={additions} format={formatCount} />
				</span>
				<span
					className={isActive ? "text-red-400/90" : "text-muted-foreground"}
				>
					−<AnimatedNumber value={deletions} format={formatCount} />
				</span>
			</div>
		</div>
	);
}
