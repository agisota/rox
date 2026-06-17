import type { WorkspaceState } from "@rox/panes";
import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { cn } from "@rox/ui/lib/utils";
import { motionSpring, useShouldAnimate } from "@rox/ui/motion";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
	HiOutlineArrowPath,
	HiOutlineBarsArrowDown,
	HiOutlineCpuChip,
} from "react-icons/hi2";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	logStressEvent,
	useRenderStressInstrumentation,
} from "renderer/lib/performance/stress-instrumentation";
import {
	navigateToWorkspace as navigateToV1Workspace,
	navigateToV2Workspace,
} from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { getVisibleSidebarWorkspaces } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useTabsStore } from "renderer/stores/tabs/store";
import { AppResourceSection } from "./components/AppResourceSection";
import { MetricBadge } from "./components/MetricBadge";
import { WorkspaceResourceSection } from "./components/WorkspaceResourceSection";
import {
	getResourceMonitorRefetchInterval,
	shouldQueryResourceMonitor,
} from "./resourceConsumptionPolicy";
import type { SessionMetrics, SortOption, UsageValues } from "./types";
import { formatCpu, formatMemory, formatPercent } from "./utils/formatters";
import { normalizeResourceMetricsSnapshot } from "./utils/normalizeSnapshot";
import { getTrackedHostMemorySeverity } from "./utils/resourceSeverity";

const SORT_LABELS: Record<SortOption, string> = {
	memory: "Память",
	cpu: "ЦП",
	name: "Имя",
	sidebar: "Порядок в сайдбаре",
};

function getTotalUsage(
	cpu: number | undefined,
	memory: number | undefined,
): UsageValues {
	return {
		cpu: cpu ?? 0,
		memory: memory ?? 0,
	};
}

function getTrackedMemorySharePercent(
	totalMemory: number,
	hostTotalMemory: number,
): number {
	if (hostTotalMemory <= 0) return 0;
	return (totalMemory / hostTotalMemory) * 100;
}

function getTerminalIdFromPaneData(data: unknown): string | null {
	if (!data || typeof data !== "object") return null;
	const terminalId = (data as { terminalId?: unknown }).terminalId;
	return typeof terminalId === "string" && terminalId.length > 0
		? terminalId
		: null;
}

function getTerminalTitleOverrides(
	rows: Array<{ paneLayout: unknown }>,
): Map<string, string> {
	const overrides = new Map<string, string>();
	for (const row of rows) {
		const layout = row.paneLayout as WorkspaceState<unknown> | undefined;
		if (!Array.isArray(layout?.tabs)) continue;
		for (const tab of layout.tabs) {
			if (!tab.panes || typeof tab.panes !== "object") continue;
			for (const pane of Object.values(tab.panes)) {
				if (pane.kind !== "terminal" || !pane.titleOverride) continue;
				const terminalId = getTerminalIdFromPaneData(pane.data);
				if (terminalId && !overrides.has(terminalId)) {
					overrides.set(terminalId, pane.titleOverride);
				}
			}
		}
	}
	return overrides;
}

interface ResourceConsumptionProps {
	surface?: "v1" | "v2";
	className?: string;
}

export function ResourceConsumption({
	surface = "v1",
	className,
}: ResourceConsumptionProps) {
	const [open, setOpen] = useState(false);
	const { data: enabled } =
		electronTrpc.settings.getShowResourceMonitor.useQuery();

	useRenderStressInstrumentation("ResourceConsumptionTrigger", {
		warnAt: 25,
		getDetails: () => ({ open, surface }),
	});

	if (!enabled) return null;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Потребление ресурсов"
							className={cn(
								"no-drag relative text-muted-foreground hover:text-foreground",
								className,
							)}
						>
							<HiOutlineCpuChip className="size-3.5" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={6} showArrow={false}>
					Ресурсы
				</TooltipContent>
			</Tooltip>

			{open && (
				<ResourceConsumptionContent
					surface={surface}
					onClose={() => setOpen(false)}
				/>
			)}
		</Popover>
	);
}

interface ResourceConsumptionContentProps {
	surface: "v1" | "v2";
	onClose: () => void;
}

function ResourceConsumptionContent({
	surface,
	onClose,
}: ResourceConsumptionContentProps) {
	const [sortOption, setSortOption] = useState<SortOption>("memory");
	const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(
		new Set(),
	);
	const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Set<string>>(
		new Set(),
	);

	const shouldAnimate = useShouldAnimate("essential");
	const navigate = useNavigate();
	const panes = useTabsStore((state) => state.panes);
	const setActiveTab = useTabsStore((state) => state.setActiveTab);
	const setFocusedPane = useTabsStore((state) => state.setFocusedPane);
	const collections = useCollections();
	const isV2 = surface === "v2";
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? undefined;

	useRenderStressInstrumentation("ResourceConsumptionContent", {
		warnAt: 25,
		getDetails: () => ({ surface }),
	});

	const { data: rawSidebarProjects = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sp: collections.v2SidebarProjects })
				.orderBy(({ sp }) => sp.tabOrder, "asc")
				.select(({ sp }) => ({ projectId: sp.projectId })),
		[collections],
	);

	const { data: rawSidebarWorkspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ ws: collections.v2WorkspaceLocalState })
				.orderBy(({ ws }) => ws.sidebarState.tabOrder, "asc")
				.select(({ ws }) => ({
					workspaceId: ws.workspaceId,
					isHidden: ws.sidebarState.isHidden,
					paneLayout: ws.paneLayout,
				})),
		[collections],
	);

	const sidebarProjectOrder = useMemo(
		() => rawSidebarProjects.map((p) => p.projectId),
		[rawSidebarProjects],
	);

	const sidebarWorkspaceOrder = useMemo(
		() =>
			getVisibleSidebarWorkspaces(rawSidebarWorkspaces).map(
				(w) => w.workspaceId,
			),
		[rawSidebarWorkspaces],
	);

	const terminalTitleOverrides = useMemo(
		() => getTerminalTitleOverrides(rawSidebarWorkspaces),
		[rawSidebarWorkspaces],
	);

	const { data: rawV2Projects = [] } = useLiveQuery(
		(q) =>
			q.from({ project: collections.v2Projects }).select(({ project }) => ({
				id: project.id,
				name: project.name,
			})),
		[collections],
	);

	const { data: rawV2Workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspace: collections.v2Workspaces })
				.select(({ workspace }) => ({
					id: workspace.id,
					projectId: workspace.projectId,
					name: workspace.name,
				})),
		[collections],
	);

	const shouldQueryMetrics = shouldQueryResourceMonitor({
		enabled: true,
		open: true,
	});

	const {
		data: snapshot,
		refetch,
		isFetching,
	} = electronTrpc.resourceMetrics.getSnapshot.useQuery(
		{
			mode: "interactive",
			surface,
			organizationId,
		},
		{
			enabled: shouldQueryMetrics,
			refetchInterval: getResourceMonitorRefetchInterval(true),
		},
	);

	useEffect(() => {
		if (!isFetching) return;
		logStressEvent("resource-monitor.fetch", { surface });
	}, [isFetching, surface]);

	const normalizedSnapshot = useMemo(() => {
		const normalized = normalizeResourceMetricsSnapshot(snapshot);
		if (!normalized || !isV2) return normalized;

		const projectById = new Map(
			rawV2Projects.map((project) => [project.id, project]),
		);
		const workspaceById = new Map(
			rawV2Workspaces.map((workspace) => [workspace.id, workspace]),
		);

		return {
			...normalized,
			workspaces: normalized.workspaces.map((workspace) => {
				const v2Workspace = workspaceById.get(workspace.workspaceId);
				const projectId = v2Workspace?.projectId ?? workspace.projectId;
				const project = projectById.get(projectId);
				return {
					...workspace,
					projectId,
					projectName: project?.name ?? workspace.projectName,
					workspaceName: v2Workspace?.name ?? workspace.workspaceName,
					sessions: workspace.sessions.map((session) => ({
						...session,
						title:
							terminalTitleOverrides.get(session.paneId) ??
							session.title ??
							null,
					})),
				};
			}),
		};
	}, [snapshot, isV2, rawV2Projects, rawV2Workspaces, terminalTitleOverrides]);

	const getPaneName = (session: SessionMetrics): string => {
		if (isV2) {
			return session.title ?? `Terminal ${session.sessionId.slice(0, 8)}`;
		}
		const pane = panes[session.paneId];
		return pane?.name || `Pane ${session.paneId.slice(0, 6)}`;
	};

	const navigateToWorkspace = (workspaceId: string) => {
		if (isV2) {
			void navigateToV2Workspace(workspaceId, navigate);
		} else {
			void navigateToV1Workspace(workspaceId, navigate);
		}
		onClose();
	};

	const navigateToPane = (workspaceId: string, paneId: string) => {
		if (isV2) {
			void navigateToV2Workspace(workspaceId, navigate, {
				search: {
					terminalId: paneId,
					focusRequestId: crypto.randomUUID(),
				},
			});
			onClose();
			return;
		}

		const pane = panes[paneId];
		if (pane) {
			setActiveTab(workspaceId, pane.tabId);
			setFocusedPane(pane.tabId, paneId);
		}
		void navigateToV1Workspace(workspaceId, navigate);
		onClose();
	};

	const toggleWorkspace = (workspaceId: string) => {
		setCollapsedWorkspaces((prev) => {
			const next = new Set(prev);
			if (next.has(workspaceId)) {
				next.delete(workspaceId);
			} else {
				next.add(workspaceId);
			}
			return next;
		});
	};

	const toggleProject = (projectId: string) => {
		setCollapsedProjects((prev) => {
			const next = new Set(prev);
			if (next.has(projectId)) {
				next.delete(projectId);
			} else {
				next.add(projectId);
			}
			return next;
		});
	};

	const totalUsage = getTotalUsage(
		normalizedSnapshot?.totalCpu,
		normalizedSnapshot?.totalMemory,
	);

	const trackedMemorySharePercent = normalizedSnapshot
		? getTrackedMemorySharePercent(
				normalizedSnapshot.totalMemory,
				normalizedSnapshot.host.totalMemory,
			)
		: 0;

	const hostShareSeverity = getTrackedHostMemorySeverity(
		trackedMemorySharePercent,
	);
	const shareBarColorClass =
		hostShareSeverity === "high"
			? "bg-red-500/80"
			: hostShareSeverity === "elevated"
				? "bg-amber-500/80"
				: "bg-foreground/40";
	return (
		<PopoverContent align="start" className="w-[28rem] p-0 overflow-hidden">
			<div className="px-3.5 pt-3 pb-3 border-b border-border/60">
				<div className="flex items-center justify-between">
					<h4 className="text-[12px] font-medium tracking-tight text-foreground">
						Ресурсы
					</h4>
					<div className="flex items-center gap-0.5">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="flex items-center gap-1 h-6 px-1.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
									aria-label="Сортировка"
								>
									<HiOutlineBarsArrowDown className="h-3.5 w-3.5" />
									<span>{SORT_LABELS[sortOption]}</span>
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-40">
								<DropdownMenuRadioGroup
									value={sortOption}
									onValueChange={(value) => setSortOption(value as SortOption)}
								>
									<DropdownMenuRadioItem value="memory">
										Память
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="cpu">ЦП</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="name">
										Имя
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="sidebar">
										Порядок в сайдбаре
									</DropdownMenuRadioItem>
								</DropdownMenuRadioGroup>
							</DropdownMenuContent>
						</DropdownMenu>
						<button
							type="button"
							onClick={() => refetch()}
							className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
							aria-label="Обновить метрики"
						>
							<HiOutlineArrowPath
								className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
							/>
						</button>
					</div>
				</div>

				{normalizedSnapshot && (
					<>
						<div className="mt-3 grid grid-cols-3 divide-x divide-border/50">
							<MetricBadge
								label="ЦП"
								value={formatCpu(normalizedSnapshot.totalCpu)}
								numericValue={normalizedSnapshot.totalCpu}
								format={formatCpu}
								tooltip="Суммарная загрузка ЦП приложением Rox и отслеживаемыми деревьями процессов терминалов. Больше 100% — заняты несколько ядер. Долгая высокая загрузка обычно вызывает тормоза интерфейса и повышенный расход батареи."
							/>
							<MetricBadge
								label="Память"
								value={formatMemory(normalizedSnapshot.totalMemory)}
								numericValue={normalizedSnapshot.totalMemory}
								format={formatMemory}
								tooltip="Резидентная память приложения Rox и отслеживаемых деревьев процессов терминалов. Если значение постоянно растёт и не падает — процесс рабочего пространства может удерживать память. Высокие значения повышают риск свопа и подтормаживаний."
							/>
							<MetricBadge
								label="Доля ОЗУ"
								value={formatPercent(trackedMemorySharePercent)}
								numericValue={trackedMemorySharePercent}
								format={formatPercent}
								tooltip="Доля общей системной ОЗУ, занятая только отслеживаемыми ресурсами Rox (не всеми приложениями). Высокая доля — Rox главный источник нагрузки на память; низкая — нагрузка, вероятно, в другом месте."
							/>
						</div>
						<Tooltip delayDuration={150}>
							<TooltipTrigger asChild>
								<div
									className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted/60"
									role="progressbar"
									aria-label="Доля системной ОЗУ"
									aria-valuenow={Math.round(trackedMemorySharePercent)}
									aria-valuemin={0}
									aria-valuemax={100}
								>
									<motion.div
										className={cn(
											"h-full w-full rounded-full",
											shareBarColorClass,
										)}
										style={{ originX: 0 }}
										initial={false}
										animate={{
											scaleX:
												Math.min(100, Math.max(0, trackedMemorySharePercent)) /
												100,
										}}
										transition={
											shouldAnimate ? motionSpring.soft : { duration: 0 }
										}
									/>
								</div>
							</TooltipTrigger>
							<TooltipContent side="bottom" sideOffset={6} showArrow={false}>
								Rox использует {formatPercent(trackedMemorySharePercent)}{" "}
								системной ОЗУ
							</TooltipContent>
						</Tooltip>
					</>
				)}
			</div>

			<div className="max-h-[50vh] overflow-y-auto">
				{normalizedSnapshot && (
					<AppResourceSection
						app={normalizedSnapshot.app}
						totalUsage={totalUsage}
					/>
				)}

				{normalizedSnapshot && (
					<WorkspaceResourceSection
						workspaces={normalizedSnapshot.workspaces}
						sortOption={sortOption}
						sidebarProjectOrder={sidebarProjectOrder}
						sidebarWorkspaceOrder={sidebarWorkspaceOrder}
						collapsedProjects={collapsedProjects}
						toggleProject={toggleProject}
						collapsedWorkspaces={collapsedWorkspaces}
						toggleWorkspace={toggleWorkspace}
						navigateToWorkspace={navigateToWorkspace}
						navigateToPane={navigateToPane}
						getPaneName={getPaneName}
					/>
				)}

				{normalizedSnapshot && normalizedSnapshot.workspaces.length === 0 && (
					<div className="px-3.5 py-6 text-center text-[11px] text-muted-foreground">
						Нет активных сессий терминала
					</div>
				)}

				{!normalizedSnapshot && (
					<div className="px-3.5 py-6 text-center text-[11px] text-muted-foreground">
						Загрузка…
					</div>
				)}
			</div>
		</PopoverContent>
	);
}
