import type { HostAgentConfig } from "@rox/host-service/settings";
import type { ExecutionMode, TerminalPreset } from "@rox/local-db";
import { Alert, AlertDescription } from "@rox/ui/alert";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { toast } from "@rox/ui/sonner";
import { Switch } from "@rox/ui/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HiExclamationTriangle, HiOutlineFolderOpen } from "react-icons/hi2";
import { V2_AGENT_CONFIGS_QUERY_KEY } from "renderer/hooks/useV2AgentConfigs";
import {
	findLinkedAgent,
	getAgentCommandText,
	isAgentCommandPatchChanged,
	parseAgentCommandText,
	resolvePresetLaunchCommands,
} from "renderer/lib/agent-launch-command";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { PresetColumnKey } from "renderer/routes/_authenticated/settings/presets/types";
import { useSettingsOriginRoute } from "renderer/stores/settings-state";
import {
	isAbsoluteFilesystemPath,
	toAbsoluteWorkspacePath,
	toRelativeWorkspacePath,
} from "shared/absolute-paths";
import { CommandsEditor } from "../../../PresetRow/components/CommandsEditor";
import type { AutoApplyField } from "../../constants";
import type { PresetProjectOption } from "../../preset-project-options";
import { ProjectTargetingField } from "./components/ProjectTargetingField";

interface PresetWithAgent extends TerminalPreset {
	agentId?: string;
}

interface PresetEditorDialogProps {
	preset: TerminalPreset | null;
	projects: PresetProjectOption[];
	/**
	 * Host-service agent configs. When provided and `preset.agentId` matches
	 * a config id, the dialog renders the linked-agent branch (read-only
	 * command + Open in Agents settings link). Older v2 rows may store presetId,
	 * so the resolver keeps a presetId fallback. v1 callers omit this — no v1
	 * row has agentId, so the linked branch stays dormant.
	 */
	agents?: HostAgentConfig[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDeletePreset: () => void;
	onFieldChange: (column: PresetColumnKey, value: string) => void;
	onFieldBlur: (column: PresetColumnKey) => void;
	onProjectIdsChange: (projectIds: string[] | null) => void;
	onDirectorySelect: (path: string) => void;
	onCommandsChange: (commands: string[]) => void;
	onCommandsBlur: () => void;
	onModeChange: (mode: ExecutionMode) => void;
	onToggleAutoApply: (field: AutoApplyField, enabled: boolean) => void;
	onToggleWorkspaceRun: (enabled: boolean) => void;
	modeValue: ExecutionMode;
	hasMultipleCommands: boolean;
	isWorkspaceRun: boolean;
	isWorkspaceCreation: boolean;
	isNewTab: boolean;
}

function getWorkspaceIdFromRoute(route: string): string | null {
	const match = route.match(/\/workspace\/([^/]+)/);
	return match ? match[1] : null;
}

function toPresetDirectoryValue(
	workspacePath: string,
	selectedPath: string,
): string {
	const relativePath = toRelativeWorkspacePath(workspacePath, selectedPath);
	if (isAbsoluteFilesystemPath(relativePath)) {
		return selectedPath;
	}
	return relativePath === "." ? "." : `./${relativePath}`;
}

interface DialogRowProps {
	label: string;
	hint?: React.ReactNode;
	htmlFor?: string;
	stacked?: boolean;
	children: React.ReactNode;
}

function DialogRow({
	label,
	hint,
	htmlFor,
	stacked,
	children,
}: DialogRowProps) {
	if (stacked) {
		return (
			<div className="py-2.5 space-y-2">
				<div className="space-y-0.5">
					<Label htmlFor={htmlFor} className="text-sm font-medium">
						{label}
					</Label>
					{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
				</div>
				{children}
			</div>
		);
	}
	return (
		<div className="flex items-start justify-between gap-6 py-2.5">
			<div className="min-w-0 flex-1">
				<Label htmlFor={htmlFor} className="text-sm font-medium">
					{label}
				</Label>
				{hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
			</div>
			<div className="w-72 shrink-0">{children}</div>
		</div>
	);
}

interface SegmentedOption<T extends string> {
	value: T;
	label: string;
}

interface SegmentedProps<T extends string> {
	value: T;
	onChange: (value: T) => void;
	options: SegmentedOption<T>[];
	className?: string;
}

function Segmented<T extends string>({
	value,
	onChange,
	options,
	className,
}: SegmentedProps<T>) {
	return (
		<div
			className={`inline-flex rounded-md border border-border overflow-hidden w-full ${className ?? ""}`.trim()}
		>
			{options.map((option, idx) => (
				<button
					key={option.value}
					type="button"
					onClick={() => onChange(option.value)}
					className={`flex-1 px-3 py-1 text-xs font-medium transition-colors ${
						idx > 0 ? "border-l border-border" : ""
					} ${
						value === option.value
							? "bg-accent text-accent-foreground"
							: "bg-transparent text-muted-foreground hover:bg-accent/50"
					}`}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

export function PresetEditorDialog({
	preset,
	projects,
	agents,
	open,
	onOpenChange,
	onDeletePreset,
	onFieldChange,
	onFieldBlur,
	onProjectIdsChange,
	onDirectorySelect,
	onCommandsChange,
	onCommandsBlur,
	onModeChange,
	onToggleAutoApply,
	onToggleWorkspaceRun,
	modeValue,
	hasMultipleCommands,
	isWorkspaceRun,
	isWorkspaceCreation,
	isNewTab,
}: PresetEditorDialogProps) {
	const linkedAgent = useMemo(() => {
		const presetAgentId = (preset as PresetWithAgent | null)?.agentId;
		return findLinkedAgent(agents, presetAgentId);
	}, [preset, agents]);
	const linkedAgentId = (preset as PresetWithAgent | null)?.agentId;
	const isLinked = !!linkedAgentId;
	const liveCommands = useMemo(
		() =>
			preset
				? resolvePresetLaunchCommands(preset as PresetWithAgent, agents)
				: [],
		[preset, agents],
	);
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const queryClient = useQueryClient();
	const queryFamily = { queryKey: V2_AGENT_CONFIGS_QUERY_KEY };
	const [linkedCommandText, setLinkedCommandText] = useState(() =>
		linkedAgent ? getAgentCommandText(linkedAgent) : "",
	);
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const originRoute = useSettingsOriginRoute();

	useEffect(() => {
		if (linkedAgent) setLinkedCommandText(getAgentCommandText(linkedAgent));
	}, [linkedAgent]);

	const updateLinkedAgentMutation = useMutation({
		mutationFn: ({
			id,
			patch,
		}: {
			id: string;
			patch: ReturnType<typeof parseAgentCommandText>;
		}) => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, {
						action: "сохранить команду агента",
					}),
				);
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.update.mutate({ id, patch });
		},
		onSuccess: (updated) => {
			queryClient.setQueriesData<HostAgentConfig[]>(queryFamily, (current) =>
				current?.map((config) =>
					config.id === updated.id ? { ...config, ...updated } : config,
				),
			);
			void queryClient.invalidateQueries(queryFamily);
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Не удалось сохранить"),
	});

	const handleLinkedCommandBlur = () => {
		if (!linkedAgent) return;
		const patch = parseAgentCommandText(linkedCommandText);
		if (patch.command.length === 0) {
			toast.error("Команда не может быть пустой");
			setLinkedCommandText(getAgentCommandText(linkedAgent));
			return;
		}
		if (!isAgentCommandPatchChanged(linkedAgent, patch)) return;
		updateLinkedAgentMutation.mutate({ id: linkedAgent.id, patch });
	};

	const trimmedCwd = preset?.cwd.trim() ?? "";
	const originWorkspaceId = useMemo(
		() => getWorkspaceIdFromRoute(originRoute),
		[originRoute],
	);
	const { data: originWorkspace } = electronTrpc.workspaces.get.useQuery(
		{ id: originWorkspaceId ?? "" },
		{ enabled: open && !!originWorkspaceId },
	);
	const isAbsolutePath = isAbsoluteFilesystemPath(trimmedCwd);
	const browseDefaultPath =
		(originWorkspace?.worktreePath && trimmedCwd
			? toAbsoluteWorkspacePath(originWorkspace.worktreePath, trimmedCwd)
			: undefined) ??
		(isAbsolutePath ? trimmedCwd : undefined) ??
		originWorkspace?.worktreePath ??
		undefined;
	const { data: directoryStatus } =
		electronTrpc.window.getDirectoryStatus.useQuery(
			{ path: trimmedCwd },
			{
				enabled: open && Boolean(trimmedCwd) && isAbsolutePath,
				staleTime: 5_000,
			},
		);

	const handleBrowseDirectory = async () => {
		const result = await selectDirectory.mutateAsync({
			title: "Выберите папку пресета",
			defaultPath: browseDefaultPath,
		});
		if (!result.canceled && result.path) {
			if (originWorkspace?.worktreePath) {
				onDirectorySelect(
					toPresetDirectoryValue(originWorkspace.worktreePath, result.path),
				);
				return;
			}
			onDirectorySelect(result.path);
		}
	};

	const launchModeOptions = hasMultipleCommands
		? [
				{ value: "sequential", label: "Все в текущей вкладке" },
				{
					value: "split-pane",
					label: "Все в текущей вкладке (разделенные панели)",
				},
				{ value: "new-tab", label: "Каждая в отдельной новой вкладке" },
				{
					value: "new-tab-split-pane",
					label: "Все в новой вкладке (разделенные панели)",
				},
			]
		: [
				{ value: "split-pane", label: "Открыть в текущей вкладке" },
				{ value: "new-tab", label: "Открыть в новой вкладке" },
			];
	const launchModeValue = hasMultipleCommands
		? modeValue
		: modeValue === "split-pane" || modeValue === "sequential"
			? "split-pane"
			: "new-tab";

	const directoryAlert =
		trimmedCwd && isAbsolutePath && directoryStatus?.exists === false ? (
			<Alert variant="destructive">
				<HiExclamationTriangle />
				<AlertDescription>
					Эта папка не существует. Пресет будет запускаться из корня рабочей
					области.
				</AlertDescription>
			</Alert>
		) : trimmedCwd &&
			isAbsolutePath &&
			directoryStatus?.exists &&
			!directoryStatus.isDirectory ? (
			<Alert variant="destructive">
				<HiExclamationTriangle />
				<AlertDescription>
					Этот путь существует, но не является папкой.
				</AlertDescription>
			</Alert>
		) : null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange} modal>
			<DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
				{preset ? (
					<>
						<DialogHeader>
							<DialogTitle>
								{(linkedAgent?.label ?? preset.name).trim() ||
									"Редактировать пресет"}
							</DialogTitle>
						</DialogHeader>

						<div className="space-y-3">
							{isLinked ? (
								<div className="py-2.5 space-y-2">
									<div className="flex items-center justify-between gap-3">
										<Label
											htmlFor={
												linkedAgent
													? `linked-command-${linkedAgent.id}`
													: undefined
											}
											className="text-sm font-medium"
										>
											Команда
										</Label>
										<Link
											to="/settings/agents"
											search={{ agent: linkedAgentId }}
											onClick={() => onOpenChange(false)}
											className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
										>
											Открыть {linkedAgent?.label ?? "настройки агента"}
											<ExternalLink className="size-3" />
										</Link>
									</div>
									{linkedAgent ? (
										<Input
											id={`linked-command-${linkedAgent.id}`}
											className="font-mono text-xs"
											value={linkedCommandText}
											onChange={(e) => setLinkedCommandText(e.target.value)}
											onBlur={handleLinkedCommandBlur}
											disabled={updateLinkedAgentMutation.isPending}
											placeholder="claude --dangerously-skip-permissions"
										/>
									) : (
										<div className="min-w-0 rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs">
											{liveCommands.length > 0 ? (
												liveCommands.map((command, index) => (
													<div
														key={index}
														className="break-all whitespace-pre-wrap text-foreground"
													>
														{command || "—"}
													</div>
												))
											) : (
												<div className="text-foreground">—</div>
											)}
										</div>
									)}
									{!linkedAgent && (
										<p className="text-xs text-muted-foreground">
											Связанный агент отсутствует или отключен. Показан
											сохраненный снимок.
										</p>
									)}
								</div>
							) : (
								<>
									<DialogRow label="Название" htmlFor="preset-name">
										<Input
											id="preset-name"
											value={preset.name}
											onChange={(e) => onFieldChange("name", e.target.value)}
											onBlur={() => onFieldBlur("name")}
											placeholder="Например, сервер разработки"
										/>
									</DialogRow>

									<DialogRow
										label="Описание"
										htmlFor="preset-description"
										hint="Дополнительный контекст, который отображается в списке пресетов."
									>
										<Input
											id="preset-description"
											value={preset.description ?? ""}
											onChange={(e) =>
												onFieldChange("description", e.target.value)
											}
											onBlur={() => onFieldBlur("description")}
											placeholder="Необязательно"
										/>
									</DialogRow>

									<DialogRow
										label="Команды"
										hint="Одна команда на строку. Добавьте несколько команд, чтобы запускать сгруппированный пресет."
										stacked
									>
										<CommandsEditor
											commands={preset.commands}
											onChange={onCommandsChange}
											onBlur={onCommandsBlur}
											placeholder="напр. bun run dev"
										/>
									</DialogRow>
								</>
							)}

							<DialogRow
								label="Применяется к"
								hint="Где будет доступен этот пресет."
							>
								<ProjectTargetingField
									projectIds={preset.projectIds}
									projects={projects}
									preferredProjectId={originWorkspace?.projectId ?? null}
									onChange={onProjectIdsChange}
								/>
							</DialogRow>

							<DialogRow
								label="Папка"
								htmlFor="preset-directory"
								hint="Укажите путь относительно рабочей области или абсолютный путь к папке."
							>
								<div className="flex items-center gap-2">
									<Input
										id="preset-directory"
										value={preset.cwd}
										onChange={(e) => onFieldChange("cwd", e.target.value)}
										onBlur={() => onFieldBlur("cwd")}
										placeholder="./apps/web"
										className="flex-1"
									/>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={handleBrowseDirectory}
										disabled={selectDirectory.isPending}
										aria-label="Выбрать папку"
									>
										<HiOutlineFolderOpen className="size-4" />
									</Button>
								</div>
							</DialogRow>

							{directoryAlert && (
								<div className="px-4 pb-4">{directoryAlert}</div>
							)}

							<DialogRow
								label="Режим запуска"
								hint={
									hasMultipleCommands
										? "Как открываются сгруппированные команды."
										: "Как открывается команда."
								}
							>
								{hasMultipleCommands ? (
									<Select
										value={launchModeValue}
										onValueChange={(value) =>
											onModeChange(value as ExecutionMode)
										}
									>
										<SelectTrigger size="sm" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{launchModeOptions.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								) : (
									<Segmented
										value={launchModeValue}
										onChange={(value) => onModeChange(value as ExecutionMode)}
										options={[
											{ value: "split-pane", label: "Текущая вкладка" },
											{ value: "new-tab", label: "Новая вкладка" },
										]}
									/>
								)}
							</DialogRow>

							<DialogRow
								label="Использовать для запуска рабочей области"
								htmlFor="preset-workspace-run"
								hint="Кнопка запуска будет открывать этот пресет для подходящих проектов."
							>
								<div className="flex justify-end">
									<Switch
										id="preset-workspace-run"
										checked={isWorkspaceRun}
										onCheckedChange={onToggleWorkspaceRun}
									/>
								</div>
							</DialogRow>

							<DialogRow
								label="Автозапуск при создании рабочей области"
								htmlFor="preset-workspace-autostart"
								hint="Запускать этот пресет при создании новой рабочей области."
							>
								<div className="flex justify-end">
									<Switch
										id="preset-workspace-autostart"
										checked={isWorkspaceCreation}
										onCheckedChange={(checked) =>
											onToggleAutoApply("applyOnWorkspaceCreated", checked)
										}
									/>
								</div>
							</DialogRow>

							<DialogRow
								label="Автозапуск в новой вкладке"
								htmlFor="preset-tab-autostart"
								hint="Запускать этот пресет при открытии новой вкладки терминала."
							>
								<div className="flex justify-end">
									<Switch
										id="preset-tab-autostart"
										checked={isNewTab}
										onCheckedChange={(checked) =>
											onToggleAutoApply("applyOnNewTab", checked)
										}
									/>
								</div>
							</DialogRow>
						</div>

						<DialogFooter className="sm:justify-between">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={onDeletePreset}
								className="text-destructive hover:bg-destructive/10 hover:text-destructive"
							>
								<Trash2 className="size-4" />
								Удалить пресет
							</Button>
							<Button
								type="button"
								size="sm"
								onClick={() => onOpenChange(false)}
							>
								Готово
							</Button>
						</DialogFooter>
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
