import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { KeyCapGroup } from "@rox/ui/motion";
import { toast } from "@rox/ui/sonner";
import { cn } from "@rox/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { LuSearch, LuTriangleAlert, LuX } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useDeleteWorkspace } from "renderer/react-query/workspaces/useDeleteWorkspace";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { ProjectObjectGraphSection } from "renderer/routes/_authenticated/components/ProjectObjectGraph";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import {
	buildWorkspaceFuse,
	type FlatRow,
	flattenProjectGroups,
} from "./listModel";
import type { FilterMode, ProjectGroup, WorkspaceItem } from "./types";
import { WorkspaceCommandPalette } from "./WorkspaceCommandPalette";
import { WorkspaceRow } from "./WorkspaceRow";

const FILTER_OPTIONS: { value: FilterMode; label: string }[] = [
	{ value: "all", label: "Все" },
	{ value: "active", label: "Активные" },
	{ value: "closed", label: "Закрытые" },
];

// Virtualizer geometry. Headers are shorter than rows; the virtualizer measures
// real heights via `measureElement`, these are first-paint estimates.
const ROW_ESTIMATE = 40;
const HEADER_ESTIMATE = 33;
const OVERSCAN = 12;

// Number-key quick-jump caps at workspace #9 (keys "1".."9").
const MAX_QUICK_JUMP = 9;

export function WorkspacesListView() {
	const [searchQuery, setSearchQuery] = useState("");
	const [filterMode, setFilterMode] = useState<FilterMode>("all");
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();

	const searchRef = useRef<HTMLInputElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	// Fetch all data
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const { data: allProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();

	// Fetch worktrees for all projects
	const worktreeQueries = electronTrpc.useQueries((t) =>
		allProjects.map((project) =>
			t.workspaces.getWorktreesByProject({ projectId: project.id }),
		),
	);

	// Surface partial fan-out failures instead of silently dropping them: any
	// errored per-project worktree query becomes an inline banner.
	const failedProjectCount = worktreeQueries.filter((q) => q.isError).length;

	const openWorktree = electronTrpc.workspaces.openWorktree.useMutation({
		onSuccess: (data) => {
			utils.workspaces.getAllGrouped.invalidate();
			// Navigate to the newly opened workspace
			if (data.workspace?.id) {
				navigateToWorkspace(data.workspace.id, navigate);
			}
		},
		onError: (error) => {
			toast.error(`Не удалось открыть рабочее пространство: ${error.message}`);
		},
	});

	// Combine open workspaces and closed worktrees into a single list
	const allItems = useMemo<WorkspaceItem[]>(() => {
		const items: WorkspaceItem[] = [];

		// First, add all open workspaces from groups
		for (const group of groups) {
			for (const ws of group.workspaces) {
				items.push({
					uniqueId: ws.id,
					workspaceId: ws.id,
					worktreeId: null,
					projectId: ws.projectId,
					projectName: group.project.name,
					worktreePath: ws.worktreePath,
					type: ws.type,
					branch: ws.branch,
					name: ws.name,
					lastOpenedAt: ws.lastOpenedAt,
					createdAt: ws.createdAt,
					isUnread: ws.isUnread,
					isOpen: true,
				});
			}
		}

		// Add closed worktrees (those without active workspaces)
		for (let i = 0; i < allProjects.length; i++) {
			const project = allProjects[i];
			const worktrees = worktreeQueries[i]?.data;

			if (!worktrees) continue;

			for (const wt of worktrees) {
				// Skip if this worktree has an active workspace
				if (wt.hasActiveWorkspace) continue;

				items.push({
					uniqueId: `wt-${wt.id}`,
					workspaceId: null,
					worktreeId: wt.id,
					projectId: project.id,
					projectName: project.name,
					worktreePath: wt.path,
					type: "worktree",
					branch: wt.branch,
					name: wt.branch,
					lastOpenedAt: wt.createdAt,
					createdAt: wt.createdAt,
					isUnread: false,
					isOpen: false,
				});
			}
		}

		return items;
	}, [groups, allProjects, worktreeQueries]);

	const fuse = useMemo(() => buildWorkspaceFuse(allItems), [allItems]);

	// Filter by filter mode, then fuzzy search query.
	const filteredItems = useMemo(() => {
		let items = allItems;

		if (filterMode === "active") {
			items = items.filter((ws) => ws.isOpen);
		} else if (filterMode === "closed") {
			items = items.filter((ws) => !ws.isOpen);
		}

		const trimmed = searchQuery.trim();
		if (trimmed) {
			// Fuzzy-rank, then keep only items surviving the active filter mode.
			const allowed = new Set(items.map((ws) => ws.uniqueId));
			items = fuse
				.search(trimmed)
				.map((r) => r.item)
				.filter((ws) => allowed.has(ws.uniqueId));
		}

		return items;
	}, [allItems, searchQuery, filterMode, fuse]);

	// Group by project
	const projectGroups = useMemo<ProjectGroup[]>(() => {
		const groupsMap = new Map<string, ProjectGroup>();

		for (const item of filteredItems) {
			if (!groupsMap.has(item.projectId)) {
				groupsMap.set(item.projectId, {
					projectId: item.projectId,
					projectName: item.projectName,
					workspaces: [],
				});
			}
			groupsMap.get(item.projectId)?.workspaces.push(item);
		}

		// Sort workspaces within each group: active first, then by lastOpenedAt
		for (const group of groupsMap.values()) {
			group.workspaces.sort((a, b) => {
				// Active workspaces first
				if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
				// Then by most recently opened/created
				return b.lastOpenedAt - a.lastOpenedAt;
			});
		}

		// Sort groups by most recent activity
		return Array.from(groupsMap.values()).sort((a, b) => {
			const aRecent = Math.max(...a.workspaces.map((w) => w.lastOpenedAt));
			const bRecent = Math.max(...b.workspaces.map((w) => w.lastOpenedAt));
			return bRecent - aRecent;
		});
	}, [filteredItems]);

	// Flatten to the windowed `[header | row]` stream for the virtualizer.
	const flatRows = useMemo(
		() => flattenProjectGroups(projectGroups),
		[projectGroups],
	);

	// Indices of selectable workspace rows (headers are not selectable) — drives
	// roving ↑/↓ navigation and number quick-jump.
	const rowIndices = useMemo(
		() =>
			flatRows.reduce<number[]>((acc, row, index) => {
				if (row.kind === "row") acc.push(index);
				return acc;
			}, []),
		[flatRows],
	);

	const virtualizer = useVirtualizer({
		count: flatRows.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: (index) =>
			flatRows[index]?.kind === "header" ? HEADER_ESTIMATE : ROW_ESTIMATE,
		overscan: OVERSCAN,
	});

	const handleSwitch = useCallback(
		(item: WorkspaceItem) => {
			if (item.workspaceId) {
				navigateToWorkspace(item.workspaceId, navigate);
			}
		},
		[navigate],
	);

	const handleReopen = useCallback(
		(item: WorkspaceItem) => {
			if (item.worktreeId) {
				openWorktree.mutate({ worktreeId: item.worktreeId });
			}
		},
		[openWorktree],
	);

	// Open → switch, closed → reopen. Shared by click, Enter and the palette.
	const handleActivate = useCallback(
		(item: WorkspaceItem) => {
			if (item.isOpen) handleSwitch(item);
			else handleReopen(item);
		},
		[handleSwitch, handleReopen],
	);

	// Clamp the roving cursor whenever the result set shrinks.
	useEffect(() => {
		setActiveIndex((prev) =>
			Math.min(prev, Math.max(0, rowIndices.length - 1)),
		);
	}, [rowIndices.length]);

	const moveActive = useCallback(
		(delta: number) => {
			setActiveIndex((prev) => {
				const next = Math.min(
					Math.max(0, prev + delta),
					Math.max(0, rowIndices.length - 1),
				);
				const flatIndex = rowIndices[next];
				if (flatIndex !== undefined) {
					virtualizer.scrollToIndex(flatIndex, { align: "auto" });
				}
				return next;
			});
		},
		[rowIndices, virtualizer],
	);

	const activeItem = useMemo<WorkspaceItem | null>(() => {
		const flatIndex = rowIndices[activeIndex];
		const row = flatIndex !== undefined ? flatRows[flatIndex] : undefined;
		return row?.kind === "row" ? row.item : null;
	}, [activeIndex, rowIndices, flatRows]);

	const deleteActiveWorkspace = useDeleteWorkspace({
		onError: (error) => toast.error(`Не удалось удалить: ${error.message}`),
	});

	// --- Keyboard ---------------------------------------------------------
	// cmd/ctrl+K — palette. Allowed inside inputs so it always opens.
	useHotkeys(
		"mod+k",
		(e) => {
			e.preventDefault();
			setPaletteOpen((o) => !o);
		},
		{ enableOnFormTags: true },
	);

	// "/" — focus the search field (only when not already typing).
	useHotkeys(
		"slash",
		(e) => {
			e.preventDefault();
			searchRef.current?.focus();
		},
		{ enableOnFormTags: false },
	);

	// ↑/↓ — roving selection. Disabled inside inputs so the caret still moves.
	useHotkeys(
		"down",
		(e) => {
			e.preventDefault();
			moveActive(1);
		},
		{ enableOnFormTags: false },
		[moveActive],
	);
	useHotkeys(
		"up",
		(e) => {
			e.preventDefault();
			moveActive(-1);
		},
		{ enableOnFormTags: false },
		[moveActive],
	);

	// Enter — activate the selected row.
	useHotkeys(
		"enter",
		(e) => {
			if (!activeItem) return;
			e.preventDefault();
			handleActivate(activeItem);
		},
		{ enableOnFormTags: false },
		[activeItem, handleActivate],
	);

	// 1..9 — quick-jump + activate the Nth workspace.
	useHotkeys(
		Array.from({ length: MAX_QUICK_JUMP }, (_, i) => String(i + 1)).join(","),
		(e, handler) => {
			const n = Number(handler.keys?.[0]);
			if (!Number.isInteger(n)) return;
			const target = rowIndices[n - 1];
			if (target === undefined) return;
			const row = flatRows[target];
			if (row?.kind !== "row") return;
			e.preventDefault();
			setActiveIndex(n - 1);
			handleActivate(row.item);
		},
		{ enableOnFormTags: false },
		[rowIndices, flatRows, handleActivate],
	);

	// cmd+Backspace — delete the active workspace (open workspaces only).
	useHotkeys(
		"mod+backspace",
		(e) => {
			if (!activeItem?.workspaceId) return;
			e.preventDefault();
			deleteActiveWorkspace.mutate({ id: activeItem.workspaceId });
		},
		{ enableOnFormTags: false },
		[activeItem, deleteActiveWorkspace],
	);

	// Count stats for filter badges
	const activeCount = allItems.filter((w) => w.isOpen).length;
	const closedCount = allItems.filter((w) => !w.isOpen).length;

	return (
		<div className="glass-panel flex flex-1 flex-col overflow-hidden">
			{/* Header */}
			<div className="flex items-center gap-3 border-border/50 border-b px-4 py-2">
				{/* Filter toggle */}
				<div className="flex items-center gap-1 rounded-md bg-background/50 p-0.5">
					{FILTER_OPTIONS.map((option) => {
						const count =
							option.value === "all"
								? allItems.length
								: option.value === "active"
									? activeCount
									: closedCount;
						return (
							<button
								key={option.value}
								type="button"
								onClick={() => setFilterMode(option.value)}
								className={cn(
									"rounded-md px-2 py-1 text-xs transition-colors",
									filterMode === option.value
										? "bg-accent text-foreground"
										: "text-foreground/60 hover:text-foreground",
								)}
							>
								{option.label}
								<span className="ml-1 text-foreground/40">{count}</span>
							</button>
						);
					})}
				</div>

				{/* Search */}
				<div className="relative flex-1">
					<LuSearch className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-foreground/50" />
					<Input
						ref={searchRef}
						type="text"
						placeholder="Поиск…  (нажмите /)"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="h-8 bg-background/50 pl-9"
					/>
				</div>

				{/* cmd+K hint */}
				<button
					type="button"
					onClick={() => setPaletteOpen(true)}
					className="hidden shrink-0 items-center gap-1 text-foreground/40 text-xs transition-colors hover:text-foreground/70 sm:flex"
					aria-label="Открыть командную палитру"
				>
					<KeyCapGroup keys={["⌘", "K"]} />
				</button>

				{/* Close button */}
				<Button
					variant="ghost"
					size="icon"
					onClick={() => navigate({ to: "/workspace" })}
					className="size-7 shrink-0 text-foreground/60 hover:text-foreground"
				>
					<LuX className="size-4" />
				</Button>
			</div>

			{/* Partial fan-out failure banner */}
			{failedProjectCount > 0 && (
				<div className="flex items-center gap-2 border-amber-500/30 border-b bg-amber-500/10 px-4 py-2 text-amber-600 text-xs dark:text-amber-400">
					<LuTriangleAlert className="size-3.5 shrink-0" />
					<span>
						Не удалось загрузить часть worktree
						{failedProjectCount > 1 ? ` (${failedProjectCount} проектов)` : ""}.
						Список может быть неполным.
					</span>
				</div>
			)}

			{/* Virtualized body: a single windowed column over the flattened
			    [project-header | workspace-row] stream. Sticky headers ride on
			    top of the same scroll element. */}
			<div ref={scrollRef} className="flex-1 overflow-y-auto">
				{flatRows.length > 0 ? (
					<div
						style={{
							height: virtualizer.getTotalSize(),
							position: "relative",
							width: "100%",
						}}
					>
						{virtualizer.getVirtualItems().map((virtualRow) => {
							const row = flatRows[virtualRow.index];
							if (!row) return null;
							const style = {
								position: "absolute" as const,
								top: 0,
								left: 0,
								width: "100%",
								transform: `translateY(${virtualRow.start}px)`,
							};

							if (row.kind === "header") {
								return (
									<div
										key={row.key}
										data-index={virtualRow.index}
										ref={virtualizer.measureElement}
										style={style}
									>
										<HeaderRow row={row} />
									</div>
								);
							}

							const rowOrdinal = rowIndices.indexOf(virtualRow.index);
							const isActive = rowOrdinal === activeIndex;
							return (
								<div
									key={row.key}
									data-index={virtualRow.index}
									ref={virtualizer.measureElement}
									style={style}
								>
									<div
										className={cn(
											isActive &&
												"bg-accent/40 ring-1 ring-primary/40 ring-inset",
										)}
									>
										<WorkspaceRow
											workspace={row.item}
											query={searchQuery}
											onSwitch={() => handleSwitch(row.item)}
											onReopen={() => handleReopen(row.item)}
											isOpening={
												openWorktree.isPending &&
												openWorktree.variables?.worktreeId ===
													row.item.worktreeId
											}
										/>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div className="flex h-32 items-center justify-center text-foreground/50 text-sm">
						{searchQuery
							? "Нет рабочих пространств по вашему запросу"
							: filterMode === "active"
								? "Нет активных рабочих пространств"
								: filterMode === "closed"
									? "Нет закрытых рабочих пространств"
									: "Пока нет рабочих пространств"}
					</div>
				)}
			</div>

			<WorkspaceCommandPalette
				open={paletteOpen}
				onOpenChange={setPaletteOpen}
				items={allItems}
				onSelectWorkspace={handleActivate}
				onCreate={() => openNewWorkspaceModal()}
			/>
		</div>
	);
}

/** Sticky project header + its gated object-graph shell. */
function HeaderRow({ row }: { row: Extract<FlatRow, { kind: "header" }> }) {
	return (
		<div>
			<div className="border-border/50 border-b bg-card/95 px-4 py-2 backdrop-blur-sm">
				<span className="font-medium text-foreground/70 text-xs">
					{row.projectName}
				</span>
				<span className="ml-2 text-foreground/40 text-xs">{row.count}</span>
			</div>
			{/* Project OS — native object-graph shell (gated; renders nothing
			    unless projectOs.workspaceShell is enabled + available). */}
			<ProjectObjectGraphSection v2ProjectId={row.projectId} />
		</div>
	);
}
