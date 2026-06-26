import { useDroppable } from "@dnd-kit/core";
import {
	Breadcrumb,
	BreadcrumbEllipsis,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@rox/ui/breadcrumb";
import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { Input } from "@rox/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@rox/ui/toggle-group";
import { cn } from "@rox/ui/utils";
import {
	ArrowDownUp,
	FolderPlus,
	LayoutGrid,
	Link2,
	List,
	Search,
	Upload,
} from "lucide-react";
import type { ReactNode } from "react";
import type { SortField, SortState, ViewMode } from "../types";
import {
	type BreadcrumbSegment,
	breadcrumbPath,
	type FolderCrumb,
	truncateSegments,
} from "../utils/breadcrumbPath";
import { dropTargetId } from "../utils/dnd";

interface DriveToolbarProps {
	stack: FolderCrumb[];
	onNavigate: (id: string | null) => void;
	query: string;
	onQuery: (value: string) => void;
	view: ViewMode;
	onView: (view: ViewMode) => void;
	sort: SortState;
	onSort: (field: SortField) => void;
	onCreateFolder: () => void;
	onUpload: () => void;
	onOpenShares: () => void;
	/** When true, each breadcrumb segment becomes a drag-to-move drop target. */
	droppableSegments?: boolean;
}

const SORT_LABEL: Record<SortField, string> = {
	name: "Имя",
	size: "Размер",
	date: "Дата",
};

/**
 * 56px glass toolbar. Left: breadcrumb trail (root «Диск», deep-tree ellipsis
 * truncation, stack navigation). Right: debounced search, Сетка/Список toggle
 * (persisted by the caller), a sort dropdown, «Поделиться» (shares manager),
 * «Новая папка» and a primary «Загрузить».
 */
export function DriveToolbar({
	stack,
	onNavigate,
	query,
	onQuery,
	view,
	onView,
	sort,
	onSort,
	onCreateFolder,
	onUpload,
	onOpenShares,
	droppableSegments = false,
}: DriveToolbarProps) {
	const segments = breadcrumbPath(stack);
	const { head, collapsed, tail } = truncateSegments(segments);

	return (
		<div className="glass-panel flex h-14 shrink-0 items-center gap-3 border-border/60 border-b px-4">
			<Breadcrumb className="min-w-0 flex-1">
				<BreadcrumbList>
					<BreadcrumbItem>
						{head.isCurrent ? (
							<BreadcrumbPage className="font-medium">
								{head.label}
							</BreadcrumbPage>
						) : (
							<CrumbDrop segment={head} enabled={droppableSegments}>
								<BreadcrumbLink asChild>
									<button type="button" onClick={() => onNavigate(head.id)}>
										{head.label}
									</button>
								</BreadcrumbLink>
							</CrumbDrop>
						)}
					</BreadcrumbItem>
					{collapsed ? (
						<>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbEllipsis />
							</BreadcrumbItem>
						</>
					) : null}
					{tail.map((segment) => (
						<BreadcrumbItem key={segment.id ?? "root"}>
							<BreadcrumbSeparator />
							{segment.isCurrent ? (
								<BreadcrumbPage className="max-w-40 truncate font-medium">
									{segment.label}
								</BreadcrumbPage>
							) : (
								<CrumbDrop segment={segment} enabled={droppableSegments}>
									<BreadcrumbLink asChild>
										<button
											type="button"
											className="max-w-40 truncate"
											onClick={() => onNavigate(segment.id)}
										>
											{segment.label}
										</button>
									</BreadcrumbLink>
								</CrumbDrop>
							)}
						</BreadcrumbItem>
					))}
				</BreadcrumbList>
			</Breadcrumb>

			<div className="relative hidden sm:block">
				<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
				<Input
					value={query}
					onChange={(event) => onQuery(event.target.value)}
					placeholder="Поиск в папке…"
					className="h-8 w-44 pl-8 text-xs"
					aria-label="Поиск в папке"
				/>
			</div>

			<ToggleGroup
				type="single"
				value={view}
				onValueChange={(value) => {
					if (value === "list" || value === "grid") onView(value);
				}}
				variant="outline"
				size="sm"
				aria-label="Режим отображения"
			>
				<ToggleGroupItem value="list" aria-label="Список">
					<List className="size-4" />
				</ToggleGroupItem>
				<ToggleGroupItem value="grid" aria-label="Сетка">
					<LayoutGrid className="size-4" />
				</ToggleGroupItem>
			</ToggleGroup>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="sm"
						aria-label="Сортировка"
					>
						<ArrowDownUp className="size-4" />
						<span className="hidden md:inline">{SORT_LABEL[sort.field]}</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuLabel>Сортировать по</DropdownMenuLabel>
					{(["name", "size", "date"] as const).map((field) => (
						<DropdownMenuCheckboxItem
							key={field}
							checked={sort.field === field}
							onSelect={(event) => {
								event.preventDefault();
								onSort(field);
							}}
						>
							{SORT_LABEL[field]}
							{sort.field === field
								? ` (${sort.dir === "asc" ? "↑" : "↓"})`
								: ""}
						</DropdownMenuCheckboxItem>
					))}
					<DropdownMenuSeparator />
					<p className="px-2 py-1 text-[11px] text-muted-foreground">
						Повторный выбор меняет направление.
					</p>
				</DropdownMenuContent>
			</DropdownMenu>

			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label="Управление ссылками"
				onClick={onOpenShares}
			>
				<Link2 className="size-4" />
			</Button>

			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={onCreateFolder}
			>
				<FolderPlus className="size-4" />
				<span className="hidden lg:inline">Новая папка</span>
			</Button>

			<Button type="button" size="sm" onClick={onUpload}>
				<Upload className="size-4" />
				<span className="hidden lg:inline">Загрузить</span>
			</Button>
		</div>
	);
}

/**
 * Wraps a breadcrumb segment as a dnd-kit drop target so dragging entries onto
 * an ancestor crumb (or «Диск» for the root) moves them there. Inert until a
 * drag is active; when inert it renders the child untouched so normal
 * navigation clicks are unaffected.
 */
function CrumbDrop({
	segment,
	enabled,
	children,
}: {
	segment: BreadcrumbSegment;
	enabled: boolean;
	children: ReactNode;
}) {
	const target =
		segment.id === null
			? ({ kind: "root" } as const)
			: ({ kind: "folder", id: segment.id } as const);
	const { setNodeRef, isOver } = useDroppable({
		id: dropTargetId(target),
		data: { target },
		disabled: !enabled,
	});
	if (!enabled) return <>{children}</>;
	return (
		<span
			ref={setNodeRef}
			className={cn(
				"rounded-md transition-colors",
				isOver && "bg-primary/15 ring-1 ring-primary/50",
			)}
		>
			{children}
		</span>
	);
}
