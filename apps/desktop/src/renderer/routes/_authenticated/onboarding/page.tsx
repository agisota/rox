import {
	AGENT_ROLE_DESCRIPTIONS,
	AGENT_ROLE_LABELS,
	AGENT_ROLES,
	type AgentRole,
	defaultModelForAgent,
	defaultRoleModelMapping,
	modelOptionsForAgent,
	ROLE_AGENT_OPTIONS,
	type RoleModelMapping,
} from "@rox/shared/agent-roles";
import { Button } from "@rox/ui/button";
import { Card } from "@rox/ui/card";
import { toast } from "@rox/ui/sonner";
import { Spinner } from "@rox/ui/spinner";
import { cn } from "@rox/ui/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { LuCheck, LuFolderOpen } from "react-icons/lu";
import { SiGithub } from "react-icons/si";
import { track } from "renderer/lib/analytics";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { logger } from "renderer/lib/logger";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { GhAuthDialog } from "./components/GhAuthDialog";

export const Route = createFileRoute("/_authenticated/onboarding/")({
	component: OnboardingScreen,
});

/**
 * One-screen onboarding (Ф4, #509 — Variant A). Two columns:
 *   LEFT (~2/3) "Команда агентов": 5 role rows, each [Agent ▾][Model ▾],
 *     ROX/ROX preselected, wired to the Ф3 role→model host setting (#508).
 *   RIGHT (~1/3) "Рабочая область": projects-folder picker (writes the Phase-1
 *     `projectsBaseDir`), git + gh status (reads Ф2, #507), and auto-init-git
 *     (host `autoInitGit`) + background cloud-sync (host `localFirstCreate`)
 *     toggles.
 * Nothing blocks: ROX/ROX requires zero action and [Start ▸] / [Skip] both go
 * straight into the app.
 */
function OnboardingScreen() {
	const navigate = useNavigate();
	const { refetch: refetchSession } = authClient.useSession();
	const { activeHostUrl } = useLocalHostService();
	const hostReady = activeHostUrl !== null;

	const [mapping, setMapping] = useState<RoleModelMapping>(() =>
		defaultRoleModelMapping(),
	);
	const [projectsBaseDir, setProjectsBaseDir] = useState<string | null>(null);
	const [defaultBaseDir, setDefaultBaseDir] = useState<string>("~/rox");
	const [autoInitGit, setAutoInitGit] = useState(true);
	const [cloudSync, setCloudSync] = useState(false);
	const [finishing, setFinishing] = useState(false);
	const [ghAuthOpen, setGhAuthOpen] = useState(false);

	const gitStatus = electronTrpc.system.detectGit.useQuery();
	const ghStatus = electronTrpc.system.detectGhCli.useQuery();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const installGitTools = electronTrpc.system.installGitTools.useMutation();

	// Load the persisted host settings once the local host is up. The ROX/ROX
	// defaults are already shown from local state, so the screen is interactive
	// before this resolves and never blocks on it.
	useEffect(() => {
		if (!activeHostUrl) return;
		const host = getHostServiceClientByUrl(activeHostUrl);
		let cancelled = false;
		void (async () => {
			try {
				const [roleModel, location, localFirst] = await Promise.all([
					host.settings.roleModel.get.query(),
					host.settings.projectsLocation.get.query(),
					host.settings.localFirst.get.query(),
				]);
				if (cancelled) return;
				setMapping(roleModel.mapping);
				setProjectsBaseDir(location.projectsBaseDir);
				setDefaultBaseDir(location.defaultProjectsBaseDir);
				setAutoInitGit(localFirst.autoInitGit);
				setCloudSync(localFirst.localFirstCreate);
			} catch (error) {
				logger.error("[onboarding] failed to load host settings", error);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [activeHostUrl]);

	const persistMapping = useCallback(
		(next: RoleModelMapping) => {
			setMapping(next);
			if (!activeHostUrl) return;
			const host = getHostServiceClientByUrl(activeHostUrl);
			host.settings.roleModel.set.mutate({ mapping: next }).catch((error) => {
				logger.error("[onboarding] failed to save role mapping", error);
				toast.error("Не удалось сохранить роли. Попробуйте ещё раз.");
			});
		},
		[activeHostUrl],
	);

	const setRoleAgent = useCallback(
		(role: AgentRole, agentId: string) => {
			persistMapping({
				...mapping,
				[role]: { agentId, modelId: defaultModelForAgent(agentId) },
			});
		},
		[mapping, persistMapping],
	);

	const setRoleModel = useCallback(
		(role: AgentRole, modelId: string) => {
			persistMapping({
				...mapping,
				[role]: { agentId: mapping[role].agentId, modelId },
			});
		},
		[mapping, persistMapping],
	);

	const chooseFolder = useCallback(async () => {
		if (!activeHostUrl) return;
		const result = await selectDirectory.mutateAsync({
			title: "Выберите папку для проектов",
			defaultPath: projectsBaseDir ?? defaultBaseDir,
		});
		if (result.canceled || !result.path) return;
		try {
			const host = getHostServiceClientByUrl(activeHostUrl);
			const saved = await host.settings.projectsLocation.set.mutate({
				path: result.path,
			});
			setProjectsBaseDir(saved.projectsBaseDir);
		} catch (error) {
			logger.error("[onboarding] failed to save projects folder", error);
			toast.error("Не удалось сохранить папку проектов.");
		}
	}, [activeHostUrl, defaultBaseDir, projectsBaseDir, selectDirectory]);

	const setLocalFirstFlag = useCallback(
		(patch: { autoInitGit?: boolean; localFirstCreate?: boolean }) => {
			if (!activeHostUrl) return;
			const host = getHostServiceClientByUrl(activeHostUrl);
			host.settings.localFirst.set.mutate(patch).catch((error) => {
				logger.error("[onboarding] failed to save toggle", error);
				toast.error("Не удалось сохранить настройку.");
			});
		},
		[activeHostUrl],
	);

	const finish = useCallback(
		async (outcome: "completed" | "skipped") => {
			setFinishing(true);
			track("onboarding_finished", { outcome });
			try {
				await apiTrpcClient.user.completeOnboarding.mutate();
				// Reactive refetch so the _authenticated guard sees onboardedAt before
				// we navigate, otherwise it bounces us straight back to onboarding.
				await refetchSession({ query: { disableCookieCache: true } });
			} catch (error) {
				logger.error("[onboarding] completeOnboarding failed", error);
				toast.error("Не удалось завершить запуск. Попробуйте ещё раз.");
				setFinishing(false);
				return;
			}
			await navigate({ to: "/v2-workspaces", replace: true });
		},
		[navigate, refetchSession],
	);

	const displayFolder = projectsBaseDir ?? defaultBaseDir;

	return (
		<div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-8 px-8 pt-10 pb-6">
			<div className="space-y-2">
				<h1 className="font-semibold text-2xl text-foreground">Запуск Rox</h1>
				<p className="text-muted-foreground text-sm">
					Команда агентов по умолчанию работает на ROX. Ничего настраивать не
					нужно — нажмите «Начать».
				</p>
			</div>

			<div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
				<RoleTeamPanel
					mapping={mapping}
					onAgentChange={setRoleAgent}
					onModelChange={setRoleModel}
				/>
				<WorkspacePanel
					folder={displayFolder}
					onChooseFolder={chooseFolder}
					choosingFolder={selectDirectory.isPending}
					hostReady={hostReady}
					gitInstalled={gitStatus.data?.installed === true}
					gitChecking={gitStatus.isFetching}
					ghInstalled={ghStatus.data?.installed === true}
					ghAuthenticated={ghStatus.data?.authenticated === true}
					ghChecking={ghStatus.isFetching}
					installingTools={installGitTools.isPending}
					onInstallGh={() => installGitTools.mutate()}
					onSignInGithub={() => setGhAuthOpen(true)}
					autoInitGit={autoInitGit}
					onAutoInitChange={(next) => {
						setAutoInitGit(next);
						setLocalFirstFlag({ autoInitGit: next });
					}}
					cloudSync={cloudSync}
					onCloudSyncChange={(next) => {
						setCloudSync(next);
						setLocalFirstFlag({ localFirstCreate: next });
					}}
				/>
			</div>

			<div className="flex items-center justify-end gap-3 border-border border-t pt-5">
				<Button
					type="button"
					variant="ghost"
					onClick={() => void finish("skipped")}
					disabled={finishing}
				>
					Пропустить
				</Button>
				<Button
					type="button"
					onClick={() => void finish("completed")}
					disabled={finishing}
				>
					{finishing && <Spinner className="size-3.5" />}
					Начать
				</Button>
			</div>

			<GhAuthDialog
				open={ghAuthOpen}
				onOpenChange={setGhAuthOpen}
				onExit={() => void ghStatus.refetch()}
			/>
		</div>
	);
}

interface RoleTeamPanelProps {
	mapping: RoleModelMapping;
	onAgentChange: (role: AgentRole, agentId: string) => void;
	onModelChange: (role: AgentRole, modelId: string) => void;
}

function RoleTeamPanel({
	mapping,
	onAgentChange,
	onModelChange,
}: RoleTeamPanelProps) {
	return (
		<Card className="gap-4 p-6 lg:col-span-2">
			<div className="space-y-1">
				<p className="font-medium text-foreground text-sm">Команда агентов</p>
				<p className="text-muted-foreground text-xs">
					Каждая роль направляется на выбранный агент и модель.
				</p>
			</div>
			<div className="flex flex-col divide-y divide-border">
				{AGENT_ROLES.map((role) => (
					<RoleRow
						key={role}
						role={role}
						selection={mapping[role]}
						onAgentChange={onAgentChange}
						onModelChange={onModelChange}
					/>
				))}
			</div>
		</Card>
	);
}

interface RoleRowProps {
	role: AgentRole;
	selection: RoleModelMapping[AgentRole];
	onAgentChange: (role: AgentRole, agentId: string) => void;
	onModelChange: (role: AgentRole, modelId: string) => void;
}

function RoleRow({
	role,
	selection,
	onAgentChange,
	onModelChange,
}: RoleRowProps) {
	const modelOptions = modelOptionsForAgent(selection.agentId);
	return (
		<div className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
			<div className="min-w-0 flex-1">
				<p className="font-medium text-foreground text-sm">
					{AGENT_ROLE_LABELS[role]}
				</p>
				<p className="truncate text-muted-foreground text-xs">
					{AGENT_ROLE_DESCRIPTIONS[role]}
				</p>
			</div>
			<RoleSelect
				ariaLabel={`Агент для роли ${AGENT_ROLE_LABELS[role]}`}
				value={selection.agentId}
				onChange={(value) => onAgentChange(role, value)}
				options={ROLE_AGENT_OPTIONS.map((o) => ({
					value: o.id,
					label: o.label,
				}))}
			/>
			<RoleSelect
				ariaLabel={`Модель для роли ${AGENT_ROLE_LABELS[role]}`}
				value={selection.modelId}
				onChange={(value) => onModelChange(role, value)}
				options={modelOptions}
			/>
		</div>
	);
}

interface RoleSelectProps {
	ariaLabel: string;
	value: string;
	onChange: (value: string) => void;
	options: ReadonlyArray<{ value: string; label: string }>;
}

function RoleSelect({ ariaLabel, value, onChange, options }: RoleSelectProps) {
	// A known value that isn't in the option list (e.g. a custom model id) still
	// renders so we never silently drop a stored selection.
	const hasValue = options.some((o) => o.value === value);
	return (
		<select
			aria-label={ariaLabel}
			value={value}
			onChange={(event) => onChange(event.target.value)}
			className={cn(
				"h-9 w-36 shrink-0 rounded-md border border-input bg-transparent px-2 text-foreground text-sm",
				"focus:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30",
			)}
		>
			{!hasValue && <option value={value}>{value}</option>}
			{options.map((option) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	);
}

interface WorkspacePanelProps {
	folder: string;
	onChooseFolder: () => void;
	choosingFolder: boolean;
	hostReady: boolean;
	gitInstalled: boolean;
	gitChecking: boolean;
	ghInstalled: boolean;
	ghAuthenticated: boolean;
	ghChecking: boolean;
	installingTools: boolean;
	onInstallGh: () => void;
	onSignInGithub: () => void;
	autoInitGit: boolean;
	onAutoInitChange: (next: boolean) => void;
	cloudSync: boolean;
	onCloudSyncChange: (next: boolean) => void;
}

function WorkspacePanel({
	folder,
	onChooseFolder,
	choosingFolder,
	hostReady,
	gitInstalled,
	gitChecking,
	ghInstalled,
	ghAuthenticated,
	ghChecking,
	installingTools,
	onInstallGh,
	onSignInGithub,
	autoInitGit,
	onAutoInitChange,
	cloudSync,
	onCloudSyncChange,
}: WorkspacePanelProps) {
	return (
		<Card className="gap-5 p-6">
			<div className="space-y-1">
				<p className="font-medium text-foreground text-sm">Рабочая область</p>
				<p className="text-muted-foreground text-xs">
					Где Rox создаёт проекты и как работает с Git.
				</p>
			</div>

			<div className="space-y-1.5">
				<p className="text-muted-foreground text-xs">Папка проектов</p>
				<div className="flex items-center gap-2">
					<div className="flex h-9 min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap rounded-md border bg-transparent px-3 dark:bg-input/30">
						<span className="font-mono text-foreground text-sm" title={folder}>
							{folder}
						</span>
					</div>
					<Button
						type="button"
						variant="outline"
						size="icon"
						className="size-9 shrink-0"
						onClick={onChooseFolder}
						disabled={!hostReady || choosingFolder}
						aria-label="Выбрать папку проектов"
					>
						<LuFolderOpen className="size-4" />
					</Button>
				</div>
			</div>

			<div className="space-y-2">
				<StatusLine
					label="Git"
					checking={gitChecking}
					// git is always available: detected, or the bundled portable git.
					ok
					value={gitInstalled ? "Обнаружен" : "Встроенный ✓"}
				/>
				<div className="flex items-center justify-between gap-2">
					<StatusLine
						label="GitHub CLI"
						checking={ghChecking}
						ok={ghAuthenticated}
						value={
							ghAuthenticated
								? "Подключено"
								: ghInstalled
									? "Не выполнен вход"
									: "Не установлен"
						}
					/>
					{!ghChecking &&
						(ghAuthenticated ? null : ghInstalled ? (
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={onSignInGithub}
							>
								<SiGithub className="size-3.5" />
								Войти
							</Button>
						) : (
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={onInstallGh}
								disabled={installingTools}
							>
								{installingTools && <Spinner className="size-3.5" />}
								Установить
							</Button>
						))}
				</div>
			</div>

			<div className="space-y-2 border-border border-t pt-4">
				<ToggleRow
					label="Инициализировать Git в новых проектах"
					checked={autoInitGit}
					onChange={onAutoInitChange}
				/>
				<ToggleRow
					label="Облачная синхронизация (в фоне)"
					checked={cloudSync}
					onChange={onCloudSyncChange}
				/>
			</div>
		</Card>
	);
}

interface StatusLineProps {
	label: string;
	checking: boolean;
	ok: boolean;
	value: string;
}

function StatusLine({ label, checking, ok, value }: StatusLineProps) {
	return (
		<div className="flex items-center gap-2 text-sm">
			<span className="text-muted-foreground">{label}:</span>
			{checking ? (
				<span className="flex items-center gap-1.5 text-muted-foreground">
					<Spinner className="size-3.5" />
					Проверка…
				</span>
			) : (
				<span
					className={cn(
						"flex items-center gap-1.5",
						ok ? "text-emerald-500" : "text-foreground",
					)}
				>
					{ok && <LuCheck className="size-3.5" />}
					{value}
				</span>
			)}
		</div>
	);
}

interface ToggleRowProps {
	label: string;
	checked: boolean;
	onChange: (next: boolean) => void;
}

function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
	return (
		<label className="flex cursor-pointer items-center gap-2.5 text-foreground text-sm">
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				className="size-4 rounded border-input accent-primary"
			/>
			{label}
		</label>
	);
}
