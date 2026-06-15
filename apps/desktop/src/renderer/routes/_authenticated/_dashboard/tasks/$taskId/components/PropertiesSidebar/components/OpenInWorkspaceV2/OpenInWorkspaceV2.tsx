import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { toast } from "@rox/ui/sonner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { HiArrowRight, HiChevronDown } from "react-icons/hi2";
import { AgentHarnessStatusBadge } from "renderer/components/AgentHarnessStatusBadge";
import { AgentSelect } from "renderer/components/AgentSelect";
import { env } from "renderer/env.renderer";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import {
	getOmpOdwHarnessEntry,
	isOmpAgent,
	useAgentPreinstallStatus,
} from "renderer/hooks/useAgentPreinstallStatus";
import {
	getPreferredV2AgentId,
	useV2AgentChoices,
} from "renderer/hooks/useV2AgentChoices";
import { authClient } from "renderer/lib/auth-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { DevicePicker } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";
import { useSelectedHostProjectIds } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceModalContent/hooks/useSelectedHostProjectIds";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { MOCK_ORG_ID } from "shared/constants";
import type { TaskWithStatus } from "../../../../../components/TasksView/hooks/useTasksTable";
import { deriveBranchName } from "../../../../utils/deriveBranchName";

const AGENT_STORAGE_KEY = "lastSelectedV2TaskAgent";
const NONE = "none" as const;
type SelectedAgent = string | typeof NONE;

interface OpenInWorkspaceV2Props {
	task: TaskWithStatus;
}

function synthesizeTaskPrompt(task: TaskWithStatus): string {
	const header = `${task.slug}: ${task.title}`;
	const body = task.description?.trim();
	return body ? `${header}\n\n${body}` : header;
}

function readStoredAgent(): SelectedAgent | null {
	if (typeof window === "undefined") return null;
	const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
	return stored ? (stored as SelectedAgent) : null;
}

export function OpenInWorkspaceV2({ task }: OpenInWorkspaceV2Props) {
	const navigate = useNavigate();
	const collections = useCollections();
	const hostService = useLocalHostService();
	const { machineId, activeHostUrl } = hostService;
	const { otherHosts } = useWorkspaceHostOptions();
	const { data: session } = authClient.useSession();
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { submit } = useWorkspaceCreates();
	const lastProjectId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.lastProjectId,
	);
	const setLastProjectId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastProjectId,
	);
	const lastHostId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.lastHostId,
	);
	const setLastHostId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastHostId,
	);

	const [hostId, setHostId] = useState<string | null>(
		lastHostId ?? machineId ?? null,
	);

	const { data: v2Projects } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.where(({ projects }) =>
					eq(projects.organizationId, activeOrganizationId ?? ""),
				)
				.select(({ projects }) => ({ ...projects })),
		[collections, activeOrganizationId],
	);

	const { data: githubRepositories } = useLiveQuery(
		(q) =>
			q.from({ repos: collections.githubRepositories }).select(({ repos }) => ({
				id: repos.id,
				owner: repos.owner,
				name: repos.name,
			})),
		[collections],
	);

	const setUpProjectIds = useSelectedHostProjectIds(hostId);
	const recentProjects = useMemo(() => {
		const repoById = new Map(
			(githubRepositories ?? []).map((repo) => [repo.id, repo]),
		);
		return (v2Projects ?? []).map((project) => {
			const repo = project.githubRepositoryId
				? (repoById.get(project.githubRepositoryId) ?? null)
				: null;
			return {
				id: project.id,
				name: project.name,
				githubOwner: repo?.owner ?? null,
				iconUrl: project.iconUrl ?? null,
				needsSetup:
					setUpProjectIds === null ? null : !setUpProjectIds.has(project.id),
			};
		});
	}, [v2Projects, githubRepositories, setUpProjectIds]);

	const launchHostUrl = useHostUrl(hostId);
	const { agents: v2Agents, isFetched: v2AgentsFetched } =
		useV2AgentChoices(launchHostUrl);
	const preinstallStatusQuery = useAgentPreinstallStatus(launchHostUrl);
	const odwHarnessEntry = getOmpOdwHarnessEntry(preinstallStatusQuery.data);
	const validAgentIds = useMemo(
		() => new Set(v2Agents.map((agent) => agent.id)),
		[v2Agents],
	);

	const seededProjectId =
		lastProjectId &&
		recentProjects.some((project) => project.id === lastProjectId)
			? lastProjectId
			: (recentProjects[0]?.id ?? null);
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		seededProjectId,
	);
	useEffect(() => {
		if (
			selectedProjectId &&
			recentProjects.some((project) => project.id === selectedProjectId)
		) {
			return;
		}
		setSelectedProjectId(seededProjectId);
	}, [seededProjectId, selectedProjectId, recentProjects]);

	const [selectedAgent, setSelectedAgentState] = useState<SelectedAgent>(
		() => readStoredAgent() ?? NONE,
	);
	useEffect(() => {
		if (!v2AgentsFetched) return;
		if (selectedAgent !== NONE && validAgentIds.has(selectedAgent)) return;
		const stored = readStoredAgent();
		if (stored === NONE) return;
		const preferredAgent = getPreferredV2AgentId(v2Agents);
		if (stored && validAgentIds.has(stored)) {
			setSelectedAgentState(stored);
		} else if (preferredAgent) {
			setSelectedAgentState(preferredAgent);
		} else if (selectedAgent !== NONE) {
			setSelectedAgentState(NONE);
		}
	}, [v2AgentsFetched, validAgentIds, v2Agents, selectedAgent]);
	const setSelectedAgent = (next: SelectedAgent) => {
		setSelectedAgentState(next);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(AGENT_STORAGE_KEY, next);
		}
	};
	const selectedAgentConfig = useMemo(
		() => v2Agents.find((agent) => agent.id === selectedAgent) ?? null,
		[v2Agents, selectedAgent],
	);
	const showOdwHarnessBadge = isOmpAgent(selectedAgentConfig);

	const selectedProject = recentProjects.find(
		(project) => project.id === selectedProjectId,
	);

	const handleSelectProject = (projectId: string) => {
		setSelectedProjectId(projectId);
		setLastProjectId(projectId);
	};

	const submitBlocker = useMemo<string | null>(() => {
		if (!selectedProjectId) return "Выберите проект";
		if (!hostId) return "Нет активного хоста";
		if (hostId !== machineId) {
			const remote = otherHosts.find((host) => host.id === hostId);
			if (!remote?.isOnline) return "Хост офлайн";
		} else if (!activeHostUrl) {
			return "Сервис хоста не запущен";
		}
		// While the host's project list is still loading, needsSetup is null —
		// block until we know whether the project is actually set up on the
		// chosen host, otherwise the server-side guard becomes the only check.
		if (setUpProjectIds === null) return "Проверка хоста…";
		if (selectedProject?.needsSetup === true) {
			return "Проект не настроен на этом хосте";
		}
		// Agent UUIDs are host-scoped. Right after a host switch the stored id
		// from the previous host is still in selectedAgent until the agent
		// query resolves and the corrective effect runs — block submission so
		// we don't send an id this host doesn't recognize.
		if (selectedAgent !== NONE) {
			if (!v2AgentsFetched) return "Проверка агентов…";
			if (!validAgentIds.has(selectedAgent)) {
				return "Выбранный агент недоступен на этом хосте";
			}
		}
		return null;
	}, [
		selectedProjectId,
		selectedProject?.needsSetup,
		setUpProjectIds,
		selectedAgent,
		v2AgentsFetched,
		validAgentIds,
		hostId,
		machineId,
		otherHosts,
		activeHostUrl,
	]);

	const handleOpen = () => {
		if (submitBlocker) {
			if (hostId === machineId && !activeHostUrl) {
				showHostServiceUnavailableToast(hostService, {
					action: "открыть задачу в рабочем пространстве",
				});
			} else {
				toast.error(submitBlocker);
			}
			return;
		}
		if (!selectedProjectId || !hostId) return;

		const snapshotId = crypto.randomUUID();
		const branch = deriveBranchName({ slug: task.slug, title: task.title });
		const agents =
			selectedAgent === NONE
				? undefined
				: [
						{
							agent: selectedAgent,
							prompt: synthesizeTaskPrompt(task),
						},
					];

		// Navigate optimistically — the host service uses our supplied id for new
		// workspaces, so the route is correct in the common case. If the server
		// found an existing workspace under a different id, the success handler
		// replaces the URL.
		void navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: snapshotId },
		});

		const { completed } = submit({
			hostId,
			snapshot: {
				id: snapshotId,
				projectId: selectedProjectId,
				name: task.title,
				branch,
				taskId: task.id,
				agents,
			},
		});

		void completed.then((outcome) => {
			if (!outcome.ok) return;
			if (outcome.workspaceId !== snapshotId) {
				void navigate({
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId: outcome.workspaceId },
					replace: true,
				});
			}
		});
	};

	return (
		<div className="flex flex-col gap-2">
			<span className="text-xs text-muted-foreground">
				В рабочем пространстве
			</span>
			<DevicePicker
				hostId={hostId}
				onSelectHostId={(next) => {
					setHostId(next);
					setLastHostId(next);
				}}
				className="w-full max-w-none h-8"
			/>
			<div className="flex gap-1.5">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className="flex-1 justify-between font-normal h-8 min-w-0"
						>
							<span className="flex items-center gap-2 truncate">
								{selectedProject ? (
									<>
										<ProjectThumbnail
											projectName={selectedProject.name}
											iconUrl={selectedProject.iconUrl}
											className="size-4"
										/>
										<span className="truncate">{selectedProject.name}</span>
									</>
								) : (
									<span className="text-muted-foreground">Выберите проект</span>
								)}
							</span>
							<HiChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						className="w-[--radix-dropdown-menu-trigger-width]"
					>
						{recentProjects.length === 0 ? (
							<DropdownMenuItem disabled>Проекты не найдены</DropdownMenuItem>
						) : (
							recentProjects.map((project) => (
								<DropdownMenuItem
									key={project.id}
									onClick={() => handleSelectProject(project.id)}
									className="flex items-center gap-2"
								>
									<ProjectThumbnail
										projectName={project.name}
										iconUrl={project.iconUrl}
										className="size-4"
									/>
									<span className="flex-1 truncate">{project.name}</span>
									{project.needsSetup === true && (
										<span className="text-[10px] text-amber-500 shrink-0">
											не настроен
										</span>
									)}
								</DropdownMenuItem>
							))
						)}
					</DropdownMenuContent>
				</DropdownMenu>
				<Button
					size="icon"
					aria-label="Открыть в рабочем пространстве"
					className="h-8 w-8 shrink-0"
					disabled={!!submitBlocker}
					onClick={handleOpen}
				>
					<HiArrowRight className="w-3.5 h-3.5" />
				</Button>
			</div>
			<AgentSelect<SelectedAgent>
				agents={v2Agents}
				value={selectedAgent}
				placeholder="Выберите агента"
				onValueChange={setSelectedAgent}
				triggerClassName="h-8 text-xs"
				allowNone
				noneLabel="Без агента"
				noneValue={NONE}
			/>
			{showOdwHarnessBadge && (
				<AgentHarnessStatusBadge entry={odwHarnessEntry} className="mt-2" />
			)}
		</div>
	);
}
