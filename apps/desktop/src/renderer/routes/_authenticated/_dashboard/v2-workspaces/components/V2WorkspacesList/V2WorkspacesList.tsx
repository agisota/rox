import { Button } from "@rox/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@rox/ui/empty";
import { ease, useShouldAnimate } from "@rox/ui/motion";
import { ScrollArea } from "@rox/ui/scroll-area";
import { cn } from "@rox/ui/utils";
import { useMatchRoute } from "@tanstack/react-router";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useMemo, useState } from "react";
import {
	LuChevronDown,
	LuChevronRight,
	LuLayers,
	LuSearchX,
} from "react-icons/lu";
import type {
	AccessibleV2Workspace,
	V2WorkspaceHostType,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	DEVICE_FILTER_ALL,
	PROJECT_FILTER_ALL,
	useV2WorkspacesFilterStore,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { useV2ProjectLocalMetaStore } from "renderer/stores/v2-project-local-meta";
import { V2WorkspaceProjectIcon } from "../V2WorkspaceProjectIcon";
import { SortableHeader } from "./components/SortableHeader";
import { V2WorkspaceRow } from "./components/V2WorkspaceRow";
import { V2_WORKSPACES_ROW_GRID } from "./constants";
import type { SortDirection, SortField } from "./types";

interface V2WorkspacesListProps {
	workspaces: AccessibleV2Workspace[];
}

interface ProjectGroup {
	projectId: string;
	projectName: string;
	githubOwner: string | null;
	workspaces: AccessibleV2Workspace[];
	latestCreatedAt: number;
}

function hostTypeRank(hostType: V2WorkspaceHostType): number {
	return hostType === "local-device" ? 0 : 1;
}

function compareWorkspaces(
	a: AccessibleV2Workspace,
	b: AccessibleV2Workspace,
	field: SortField,
	direction: SortDirection,
): number {
	let cmp = 0;
	switch (field) {
		case "sidebar":
			cmp = Number(a.isInSidebar) - Number(b.isInSidebar);
			break;
		case "name":
			cmp = a.name.localeCompare(b.name);
			break;
		case "host":
			cmp = hostTypeRank(a.hostType) - hostTypeRank(b.hostType);
			if (cmp === 0) cmp = a.hostName.localeCompare(b.hostName);
			break;
		case "branch":
			cmp = a.branch.localeCompare(b.branch);
			break;
		case "created":
			cmp = a.createdAt.getTime() - b.createdAt.getTime();
			break;
	}
	const directional = direction === "asc" ? cmp : -cmp;
	if (directional !== 0) return directional;
	return b.createdAt.getTime() - a.createdAt.getTime();
}

function groupByProject(
	workspaces: AccessibleV2Workspace[],
	sortField: SortField,
	sortDirection: SortDirection,
): ProjectGroup[] {
	const projectsById = new Map<string, ProjectGroup>();

	for (const workspace of workspaces) {
		let project = projectsById.get(workspace.projectId);
		if (!project) {
			project = {
				projectId: workspace.projectId,
				projectName: workspace.projectName,
				githubOwner: workspace.projectGithubOwner,
				workspaces: [],
				latestCreatedAt: 0,
			};
			projectsById.set(workspace.projectId, project);
		}
		project.workspaces.push(workspace);
		const createdAt = workspace.createdAt.getTime();
		if (createdAt > project.latestCreatedAt) {
			project.latestCreatedAt = createdAt;
		}
	}

	for (const project of projectsById.values()) {
		project.workspaces.sort((a, b) =>
			compareWorkspaces(a, b, sortField, sortDirection),
		);
	}

	return Array.from(projectsById.values()).sort(
		(a, b) => b.latestCreatedAt - a.latestCreatedAt,
	);
}

const DEFAULT_DIRECTION_BY_FIELD: Record<SortField, SortDirection> = {
	sidebar: "desc",
	name: "asc",
	host: "asc",
	branch: "asc",
	created: "desc",
};

// Case 030: staggered entrance for the empty/filtered dashboard state.
const emptyContainer = {
	hidden: {},
	show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const emptyItem = {
	hidden: { opacity: 0, y: 8 },
	show: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.22, ease: ease.standard },
	},
};

export function V2WorkspacesList({ workspaces }: V2WorkspacesListProps) {
	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
	});
	const currentWorkspaceId =
		currentWorkspaceMatch !== false ? currentWorkspaceMatch.workspaceId : null;

	const searchQuery = useV2WorkspacesFilterStore((state) => state.searchQuery);
	const deviceFilter = useV2WorkspacesFilterStore(
		(state) => state.deviceFilter,
	);
	const projectFilter = useV2WorkspacesFilterStore(
		(state) => state.projectFilter,
	);
	const resetFilters = useV2WorkspacesFilterStore((state) => state.reset);

	const [sortField, setSortField] = useState<SortField>("host");
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

	const handleSort = (field: SortField) => {
		if (sortField === field) {
			setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
		} else {
			setSortField(field);
			setSortDirection(DEFAULT_DIRECTION_BY_FIELD[field]);
		}
	};

	const projectGroups = useMemo(
		() => groupByProject(workspaces, sortField, sortDirection),
		[workspaces, sortField, sortDirection],
	);

	const totalCount = projectGroups.reduce(
		(total, project) => total + project.workspaces.length,
		0,
	);
	const hasActiveFilters =
		searchQuery.trim() !== "" ||
		deviceFilter !== DEVICE_FILTER_ALL ||
		projectFilter !== PROJECT_FILTER_ALL;

	const columnHeader = (
		<div
			className={cn(
				V2_WORKSPACES_ROW_GRID,
				"sticky top-0 z-10 h-8 border-b border-border bg-background px-6 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80",
			)}
		>
			<SortableHeader
				field="sidebar"
				label="На боковой панели"
				align="center"
				srOnlyLabel
				sortField={sortField}
				sortDirection={sortDirection}
				onSort={handleSort}
			/>
			<SortableHeader
				field="name"
				label="Название"
				sortField={sortField}
				sortDirection={sortDirection}
				onSort={handleSort}
			/>
			<SortableHeader
				field="host"
				label="Хост"
				className="hidden md:flex"
				sortField={sortField}
				sortDirection={sortDirection}
				onSort={handleSort}
			/>
			<SortableHeader
				field="branch"
				label="Ветка"
				className="hidden lg:flex"
				sortField={sortField}
				sortDirection={sortDirection}
				onSort={handleSort}
			/>
			<SortableHeader
				field="created"
				label="Создано"
				className="hidden xl:flex"
				sortField={sortField}
				sortDirection={sortDirection}
				onSort={handleSort}
			/>
		</div>
	);

	if (totalCount === 0) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{columnHeader}
				<V2WorkspacesEmptyState
					hasActiveFilters={hasActiveFilters}
					onClearFilters={() => resetFilters()}
				/>
			</div>
		);
	}

	return (
		<ScrollArea className="min-h-0 flex-1">
			<div className="flex w-full flex-col">
				{columnHeader}

				{projectGroups.map((project) => (
					<ProjectSection
						key={project.projectId}
						project={project}
						currentWorkspaceId={currentWorkspaceId}
					/>
				))}
			</div>
		</ScrollArea>
	);
}

interface V2WorkspacesEmptyStateProps {
	hasActiveFilters: boolean;
	onClearFilters: () => void;
}

// Case 030: empty/filtered dashboard state with a staggered entrance and a
// very subtle pointer-driven parallax on the media icon. Both effects are
// decorative and gated on `useShouldAnimate('decorative')`, so reduced-motion
// users get the plain static empty state with no transforms or handlers.
function V2WorkspacesEmptyState({
	hasActiveFilters,
	onClearFilters,
}: V2WorkspacesEmptyStateProps) {
	const animate = useShouldAnimate("decorative");

	const mx = useMotionValue(0);
	const my = useMotionValue(0);
	const sx = useSpring(mx, { stiffness: 150, damping: 18 });
	const sy = useSpring(my, { stiffness: 150, damping: 18 });
	const x = useTransform(sx, [-1, 1], [-4, 4]);
	const y = useTransform(sy, [-1, 1], [-4, 4]);

	const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
		if (!animate) return;
		const rect = event.currentTarget.getBoundingClientRect();
		const nx = (event.clientX - rect.left) / rect.width;
		const ny = (event.clientY - rect.top) / rect.height;
		mx.set(nx * 2 - 1);
		my.set(ny * 2 - 1);
	};

	const handleMouseLeave = () => {
		if (!animate) return;
		mx.set(0);
		my.set(0);
	};

	const icon = hasActiveFilters ? <LuSearchX /> : <LuLayers />;

	return (
		<Empty
			className="flex-1 border-0"
			onMouseMove={animate ? handleMouseMove : undefined}
			onMouseLeave={animate ? handleMouseLeave : undefined}
		>
			<motion.div
				className="flex flex-col items-center"
				variants={emptyContainer}
				initial={animate ? "hidden" : false}
				animate={animate ? "show" : false}
			>
				<EmptyHeader>
					<motion.div variants={animate ? emptyItem : undefined}>
						<EmptyMedia
							variant="icon"
							className="size-14 [&_svg:not([class*='size-'])]:size-7"
						>
							{animate ? (
								<motion.span className="inline-flex" style={{ x, y }}>
									{icon}
								</motion.span>
							) : (
								icon
							)}
						</EmptyMedia>
					</motion.div>
					<motion.div variants={animate ? emptyItem : undefined}>
						<EmptyTitle>
							{hasActiveFilters
								? "Нет рабочих пространств по заданным фильтрам"
								: "Пока нет рабочих пространств"}
						</EmptyTitle>
					</motion.div>
					<motion.div variants={animate ? emptyItem : undefined}>
						<EmptyDescription>
							{hasActiveFilters
								? "Попробуйте другой поисковый запрос или сбросьте фильтр устройств."
								: "Здесь появятся рабочие пространства, к которым у вас есть доступ на всех ваших устройствах."}
						</EmptyDescription>
					</motion.div>
				</EmptyHeader>
				{hasActiveFilters ? (
					<motion.div variants={animate ? emptyItem : undefined}>
						<EmptyContent>
							<Button variant="outline" size="sm" onClick={onClearFilters}>
								Сбросить фильтры
							</Button>
						</EmptyContent>
					</motion.div>
				) : null}
			</motion.div>
		</Empty>
	);
}

interface ProjectSectionProps {
	project: ProjectGroup;
	currentWorkspaceId: string | null;
}

function ProjectSection({ project, currentWorkspaceId }: ProjectSectionProps) {
	const persistedCollapsed = useV2ProjectLocalMetaStore(
		(state) => state.projects[project.projectId]?.isCollapsed ?? false,
	);
	const toggleCollapsed = useV2ProjectLocalMetaStore(
		(state) => state.toggleProjectCollapsed,
	);
	const containsCurrent = project.workspaces.some(
		(workspace) => workspace.id === currentWorkspaceId,
	);
	const isCollapsed = persistedCollapsed && !containsCurrent;
	const Chevron = isCollapsed ? LuChevronRight : LuChevronDown;

	return (
		<div className="flex flex-col">
			<button
				type="button"
				onClick={() => toggleCollapsed(project.projectId)}
				aria-expanded={!isCollapsed}
				aria-controls={`v2-workspaces-project-${project.projectId}`}
				className="sticky top-8 z-[5] flex w-full items-center gap-2 border-b border-border/60 bg-muted px-6 py-1.5 text-left transition-colors hover:bg-muted/80"
			>
				<Chevron className="size-3 shrink-0 text-muted-foreground" />
				<V2WorkspaceProjectIcon
					projectName={project.projectName}
					githubOwner={project.githubOwner}
					size="sm"
				/>
				<h3
					className="min-w-0 truncate text-xs font-semibold text-foreground/80"
					title={project.projectName}
				>
					{project.projectName}
				</h3>
				<span className="shrink-0 text-xs tabular-nums text-muted-foreground/60">
					{project.workspaces.length}
				</span>
			</button>
			{isCollapsed ? null : (
				<ul
					id={`v2-workspaces-project-${project.projectId}`}
					className="flex flex-col"
				>
					{project.workspaces.map((workspace) => (
						<V2WorkspaceRow
							key={workspace.id}
							workspace={workspace}
							isCurrentRoute={workspace.id === currentWorkspaceId}
						/>
					))}
				</ul>
			)}
		</div>
	);
}
