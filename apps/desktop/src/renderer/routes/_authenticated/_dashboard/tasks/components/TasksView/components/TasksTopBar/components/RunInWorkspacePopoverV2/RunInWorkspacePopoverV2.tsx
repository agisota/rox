import { Button } from "@rox/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@rox/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { toast } from "@rox/ui/sonner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HiCheck, HiMiniPlay } from "react-icons/hi2";
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
import { deriveBranchName } from "../../../../../../$taskId/utils/deriveBranchName";
import type { TaskWithStatus } from "../../../../hooks/useTasksTable";

const AGENT_STORAGE_KEY = "lastSelectedV2TaskBatchAgent";
const NONE = "none" as const;
type SelectedAgent = string | typeof NONE;

interface RunInWorkspacePopoverV2Props {
	tasks: TaskWithStatus[];
	onComplete: () => void;
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

export function RunInWorkspacePopoverV2({
	tasks,
	onComplete,
}: RunInWorkspacePopoverV2Props) {
	const collections = useCollections();
	const hostService = useLocalHostService();
	const { machineId, activeHostUrl } = hostService;
	const { data: session } = authClient.useSession();
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const { otherHosts } = useWorkspaceHostOptions();
	const { submit } = useWorkspaceCreates();

	const lastHostId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.lastHostId,
	);
	const setLastHostId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastHostId,
	);
	const lastProjectId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.lastProjectId,
	);
	const setLastProjectId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastProjectId,
	);

	const [hostId, setHostId] = useState<string | null>(
		lastHostId ?? machineId ?? null,
	);

	const launchHostUrl = useHostUrl(hostId);
	const setUpProjectIds = useSelectedHostProjectIds(hostId);
	const preinstallStatusQuery = useAgentPreinstallStatus(launchHostUrl);
	const odwHarnessEntry = getOmpOdwHarnessEntry(preinstallStatusQuery.data);

	const { data: v2Projects } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.where(({ projects }) =>
					eq(projects.organizationId, activeOrganizationId),
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
	const selectedProject = recentProjects.find(
		(project) => project.id === selectedProjectId,
	);

	const { agents: v2Agents, isFetched: v2AgentsFetched } =
		useV2AgentChoices(launchHostUrl);
	const validAgentIds = useMemo(
		() => new Set(v2Agents.map((agent) => agent.id)),
		[v2Agents],
	);

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

	const [open, setOpen] = useState(false);
	const [projectPickerOpen, setProjectPickerOpen] = useState(false);

	const submitBlocker = useMemo<string | null>(() => {
		if (!selectedProjectId) return "Выберите проект";
		if (!hostId) return "Нет активного хоста";
		if (hostId !== machineId) {
			const remote = otherHosts.find((host) => host.id === hostId);
			if (!remote?.isOnline) return "Хост офлайн";
		} else if (!activeHostUrl) {
			return "Сервис хоста не запущен";
		}
		// Block while the host's project list is still loading — otherwise users
		// can submit before we know whether the project is set up there.
		if (setUpProjectIds === null) return "Проверка хоста…";
		if (selectedProject?.needsSetup === true) {
			return "Проект не настроен на этом хосте";
		}
		// Agent UUIDs are host-scoped; block until the host-specific config
		// query resolves and the selection is verified to exist there.
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

	const handleRun = () => {
		if (!selectedProjectId || !hostId) return;
		if (submitBlocker) {
			if (hostId === machineId && !activeHostUrl) {
				showHostServiceUnavailableToast(hostService, {
					action: "запустить задачи в рабочих пространствах",
				});
			} else {
				toast.error(submitBlocker);
			}
			return;
		}

		const handles = tasks.map((task) =>
			submit({
				hostId,
				snapshot: {
					id: crypto.randomUUID(),
					projectId: selectedProjectId,
					name: task.title,
					branch: deriveBranchName({ slug: task.slug, title: task.title }),
					taskId: task.id,
					agents:
						selectedAgent === NONE
							? undefined
							: [
									{
										agent: selectedAgent,
										prompt: synthesizeTaskPrompt(task),
									},
								],
				},
			}),
		);

		const promise = Promise.all(handles.map((handle) => handle.completed)).then(
			(outcomes) => {
				const failed = outcomes.filter((outcome) => !outcome.ok).length;
				if (failed > 0) {
					const firstFailure = outcomes.find((outcome) => !outcome.ok);
					const details =
						firstFailure && !firstFailure.ok ? `: ${firstFailure.error}` : "";
					throw new Error(
						`Успешно: ${outcomes.length - failed} из ${outcomes.length}${details}`,
					);
				}
				return outcomes.length;
			},
		);

		toast.promise(promise, {
			loading: `Создание рабочих пространств: ${tasks.length}...`,
			success: (count) => `Создано рабочих пространств: ${count}`,
			error: (err) => (err instanceof Error ? err.message : String(err)),
		});

		setOpen(false);
		onComplete();
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 text-xs gap-1.5 bg-muted/50"
				>
					<HiMiniPlay className="size-3" />
					Запустить в рабочем пространстве
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-0">
				<div className="flex flex-col gap-2 p-2">
					<DevicePicker
						hostId={hostId}
						onSelectHostId={(next) => {
							setHostId(next);
							setLastHostId(next);
						}}
						className="w-full max-w-none"
					/>

					<Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
						<PopoverTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="w-full justify-between font-normal h-8 min-w-0 bg-muted/50 rounded-md"
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
										<span className="text-muted-foreground">
											Выберите проект
										</span>
									)}
								</span>
								<ChevronDownIcon className="size-4 opacity-50 shrink-0" />
							</Button>
						</PopoverTrigger>
						<PopoverContent align="start" className="w-60 p-0">
							<Command>
								<CommandInput placeholder="Поиск проектов..." />
								<CommandList>
									<CommandEmpty>Проекты не найдены.</CommandEmpty>
									<CommandGroup>
										{recentProjects.map((project) => (
											<CommandItem
												key={project.id}
												value={project.name}
												onSelect={() => {
													setSelectedProjectId(project.id);
													setLastProjectId(project.id);
													setProjectPickerOpen(false);
												}}
											>
												<ProjectThumbnail
													projectName={project.name}
													iconUrl={project.iconUrl}
													className="size-4"
												/>
												<span className="flex-1 truncate">{project.name}</span>
												{project.needsSetup === true && (
													<span className="text-[10px] text-amber-500">
														не настроен
													</span>
												)}
												{project.id === selectedProjectId && (
													<HiCheck className="size-3.5 shrink-0" />
												)}
											</CommandItem>
										))}
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>

					<AgentSelect<SelectedAgent>
						agents={v2Agents}
						value={selectedAgent}
						placeholder="Выберите агента"
						onValueChange={setSelectedAgent}
						onBeforeConfigureAgents={() => setOpen(false)}
						triggerClassName="h-8 text-xs w-full border-0 shadow-none bg-muted/50 rounded-md"
						allowNone
						noneLabel="Без агента"
						noneValue={NONE}
					/>
					{showOdwHarnessBadge && (
						<AgentHarnessStatusBadge entry={odwHarnessEntry} />
					)}
				</div>

				<div className="border-t border-border p-2">
					<Button
						size="sm"
						className="w-full h-8"
						disabled={!!submitBlocker}
						onClick={handleRun}
					>
						Запустить пространств: {tasks.length}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
