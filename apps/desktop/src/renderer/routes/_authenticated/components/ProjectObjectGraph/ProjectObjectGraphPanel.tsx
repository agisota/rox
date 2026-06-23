import { Badge } from "@rox/ui/badge";
import { Input } from "@rox/ui/input";
import { ScrollArea } from "@rox/ui/scroll-area";
import { cn } from "@rox/ui/utils";
import { LuLoaderCircle, LuNetwork, LuSearch } from "react-icons/lu";
import type { ObjectGraphNode } from "./ObjectDetailsPanel";
import { entityKindLabel } from "./relations";

export interface ProjectObjectGraphPanelProps {
	/** Project objects to list (the in-project nodes of the object graph). */
	nodes: readonly ObjectGraphNode[];
	/** Currently selected object id (drives the details panel). */
	selectedId: string | null;
	/** Select an object to open its details. */
	onSelect: (entityId: string) => void;
	/** Search box value (edge-walking project search). */
	searchValue: string;
	/** Search box change handler. */
	onSearchChange: (value: string) => void;
	/** Whether a search/list query is in flight. */
	loading?: boolean;
	/** True when more objects exist than were returned (read cap hit). */
	truncated?: boolean;
}

/**
 * Master list of a project's objects (the native object graph) with a
 * project-scoped search box. Presentational and data-driven so it unit-tests
 * with static rendering; the live `graph.projectGraph` / `graph.search` data is
 * wired by {@link ProjectObjectGraphLaunchpad}.
 */
export function ProjectObjectGraphPanel({
	nodes,
	selectedId,
	onSelect,
	searchValue,
	onSearchChange,
	loading = false,
	truncated = false,
}: ProjectObjectGraphPanelProps) {
	return (
		<section className="space-y-3" aria-label="Объекты проекта">
			<div className="space-y-1">
				<div className="flex items-center gap-2">
					<LuNetwork className="size-4 text-muted-foreground" aria-hidden />
					<h3 className="text-sm font-semibold">Объекты проекта</h3>
					{loading ? (
						<LuLoaderCircle
							className="size-3.5 animate-spin text-muted-foreground"
							aria-label="Загрузка"
						/>
					) : (
						<Badge variant="secondary" className="text-[10px]">
							{nodes.length}
						</Badge>
					)}
				</div>
				<p className="text-xs text-muted-foreground">
					Связанный граф объектов проекта — заметки, задачи, контакты, файлы и
					их связи. Без Huly, на нативном графе Rox.
				</p>
			</div>

			<div className="relative">
				<LuSearch
					className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
					aria-hidden
				/>
				<Input
					value={searchValue}
					onChange={(event) => onSearchChange(event.target.value)}
					placeholder="Поиск по объектам проекта…"
					aria-label="Поиск по объектам проекта"
					className="pl-8"
				/>
			</div>

			<ScrollArea className="h-64 rounded-md border border-border/50">
				{nodes.length === 0 ? (
					<p className="p-3 text-xs text-muted-foreground">
						{loading
							? "Загрузка объектов…"
							: searchValue.trim()
								? "По запросу ничего не найдено."
								: "В этом проекте пока нет объектов."}
					</p>
				) : (
					<ul className="divide-y divide-border/40">
						{nodes.map((node) => {
							const selected = node.entityId === selectedId;
							return (
								<li key={node.entityId}>
									<button
										type="button"
										onClick={() => onSelect(node.entityId)}
										className={cn(
											"flex w-full items-center gap-2 px-3 py-2 text-left outline-none transition-colors",
											selected
												? "bg-accent/50"
												: "hover:bg-accent/30 focus-visible:bg-accent/30",
										)}
									>
										<span className="min-w-0 flex-1 truncate text-sm">
											{node.title}
										</span>
										<span className="shrink-0 text-[10px] text-muted-foreground">
											{entityKindLabel(node.kind)}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</ScrollArea>

			{truncated ? (
				<p className="text-[10px] text-muted-foreground/70">
					Показаны не все объекты — уточните поиск, чтобы сузить результат.
				</p>
			) : null}
		</section>
	);
}
