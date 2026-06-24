import { ScrollArea } from "@rox/ui/scroll-area";
import { cn } from "@rox/ui/utils";
import { LuClock, LuLibrary, LuStar, LuTag } from "react-icons/lu";
import type { RailFilter } from "../../lib/types";

interface RailRowProps {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	count?: number;
	active: boolean;
	onSelect: () => void;
}

function RailRow({ icon: Icon, label, count, active, onSelect }: RailRowProps) {
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-current={active ? "true" : undefined}
			className={cn(
				"flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
				active
					? "bg-accent text-accent-foreground"
					: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
			)}
		>
			<Icon className="size-4 shrink-0" />
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{count !== undefined && (
				<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
					{count}
				</span>
			)}
		</button>
	);
}

export interface LeftRailProps {
	filter: RailFilter;
	onFilterChange: (filter: RailFilter) => void;
	totalCount: number;
	favoriteCount: number;
	recentCount: number;
	tags: { tag: string; count: number }[];
}

/** Collection tree: Все / Избранное / Недавние + per-tag rows. */
export function LeftRail({
	filter,
	onFilterChange,
	totalCount,
	favoriteCount,
	recentCount,
	tags,
}: LeftRailProps) {
	const isTag = (tag: string) => filter.kind === "tag" && filter.tag === tag;

	return (
		<aside className="flex w-[220px] shrink-0 flex-col border-r border-border">
			<ScrollArea className="flex-1">
				<div className="flex flex-col gap-0.5 p-2">
					<RailRow
						icon={LuLibrary}
						label="Все"
						count={totalCount}
						active={filter.kind === "all"}
						onSelect={() => onFilterChange({ kind: "all" })}
					/>
					<RailRow
						icon={LuStar}
						label="Избранное"
						count={favoriteCount}
						active={filter.kind === "favorites"}
						onSelect={() => onFilterChange({ kind: "favorites" })}
					/>
					<RailRow
						icon={LuClock}
						label="Недавние"
						count={recentCount}
						active={filter.kind === "recent"}
						onSelect={() => onFilterChange({ kind: "recent" })}
					/>

					{tags.length > 0 && (
						<>
							<div className="mt-3 flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-muted-foreground">
								<LuTag className="size-3" />
								Теги
							</div>
							{tags.map(({ tag, count }) => (
								<RailRow
									key={tag}
									icon={LuTag}
									label={tag}
									count={count}
									active={isTag(tag)}
									onSelect={() => onFilterChange({ kind: "tag", tag })}
								/>
							))}
						</>
					)}
				</div>
			</ScrollArea>
		</aside>
	);
}
