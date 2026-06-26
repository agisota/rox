import type { MemoryCategory } from "@rox/db/schema";
import { Input } from "@rox/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@rox/ui/toggle-group";
import { cn } from "@rox/ui/utils";
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from "react-icons/hi2";
import {
	CATEGORY_LABEL,
	MEMORY_GROUPS,
} from "renderer/screens/memory/MemoryView/groups";

export type CategoryFilter = "all" | MemoryCategory;

interface SearchHeaderProps {
	query: string;
	onQueryChange: (value: string) => void;
	filter: CategoryFilter;
	onFilterChange: (value: CategoryFilter) => void;
	/** Live per-category counts of approved items (for the chip badges). */
	counts: Record<CategoryFilter, number>;
	/** Total result count for the current query+filter (shown when searching). */
	resultCount: number | null;
	inputRef?: React.Ref<HTMLInputElement>;
}

const FILTER_ORDER: CategoryFilter[] = [
	"all",
	...MEMORY_GROUPS.map((g) => g.category),
];

const FILTER_LABEL: Record<CategoryFilter, string> = {
	all: "Все",
	projects: CATEGORY_LABEL.projects,
	identity: CATEGORY_LABEL.identity,
	instructions: CATEGORY_LABEL.instructions,
	career: CATEGORY_LABEL.career,
	general: CATEGORY_LABEL.general,
};

/**
 * Sticky glass retrieval header: a debounced-at-the-parent search box plus the
 * category filter chips with live counts. Composes with the query — both narrow
 * the same approved set. Lives inside the DashboardSurface content column.
 */
export function SearchHeader({
	query,
	onQueryChange,
	filter,
	onFilterChange,
	counts,
	resultCount,
	inputRef,
}: SearchHeaderProps) {
	return (
		<div className="-mx-6 sticky top-0 z-10 mb-5 border-border/60 border-b bg-background/80 px-6 pt-1 pb-3 backdrop-blur-xl">
			<div className="relative">
				<HiOutlineMagnifyingGlass className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
				<Input
					ref={inputRef}
					data-onboarding-anchor="memory-search"
					value={query}
					onChange={(e) => onQueryChange(e.target.value)}
					placeholder="Искать в памяти…"
					aria-label="Искать в памяти"
					className="h-10 pr-9 pl-9"
				/>
				{query.length > 0 && (
					<button
						type="button"
						aria-label="Очистить поиск"
						onClick={() => onQueryChange("")}
						className="-translate-y-1/2 absolute top-1/2 right-2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
					>
						<HiOutlineXMark className="size-4" />
					</button>
				)}
			</div>

			<div className="mt-2.5 flex items-center justify-between gap-3">
				<ToggleGroup
					type="single"
					value={filter}
					onValueChange={(value) => {
						// Radix emits "" when the active item is toggled off; keep "all".
						onFilterChange((value || "all") as CategoryFilter);
					}}
					variant="outline"
					size="sm"
					aria-label="Фильтр по категории"
					className="flex-wrap justify-start"
				>
					{FILTER_ORDER.map((value) => (
						<ToggleGroupItem
							key={value}
							value={value}
							aria-label={FILTER_LABEL[value]}
							className="gap-1.5 px-2.5 text-xs"
						>
							{FILTER_LABEL[value]}
							<span
								className={cn(
									"rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground tabular-nums",
									filter === value && "bg-background/60",
								)}
							>
								{counts[value] ?? 0}
							</span>
						</ToggleGroupItem>
					))}
				</ToggleGroup>

				{resultCount !== null && (
					<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
						{resultCount === 0
							? "ничего не найдено"
							: `${resultCount} ${plural(resultCount)}`}
					</span>
				)}
			</div>
		</div>
	);
}

/** RU plural for "результат". */
function plural(n: number): string {
	const mod10 = n % 10;
	const mod100 = n % 100;
	if (mod10 === 1 && mod100 !== 11) return "результат";
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
		return "результата";
	return "результатов";
}
