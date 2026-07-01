import type { AppRouter } from "@rox/host-service";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { cn } from "@rox/ui/utils";
import { workspaceTrpc } from "@rox/workspace-client";
import type { inferRouterOutputs } from "@trpc/server";
import { AlertCircle, CheckCircle2, Play, RefreshCw } from "lucide-react";
import type { OpenChatFn } from "../../hooks/usePRFlowDispatch";
import { buildFusionTaskLaunch } from "./fusion-task-launch";

type FusionTasksResult = inferRouterOutputs<AppRouter>["fusion"]["tasks"];
type FusionTaskEntry = FusionTasksResult["tasks"][number];

interface FusionTabProps {
	workspaceId: string;
	onOpenChat?: OpenChatFn;
}

export function FusionTab({ workspaceId, onOpenChat }: FusionTabProps) {
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const worktreePath = workspaceQuery.data?.worktreePath;
	const fusionQuery = workspaceTrpc.fusion.tasks.useQuery(
		{
			projectPath: worktreePath,
			limit: 25,
		},
		{
			enabled: Boolean(worktreePath),
			refetchInterval: 30_000,
			retry: false,
		},
	);

	if (workspaceQuery.isLoading || (worktreePath && fusionQuery.isLoading)) {
		return <FusionLoadingState />;
	}

	if (!worktreePath) {
		return (
			<FusionMessage
				title="Worktree не найден"
				body="Fusion mirror появится после того, как Rox увидит локальный путь workspace."
				tone="warning"
			/>
		);
	}

	if (fusionQuery.error) {
		return (
			<FusionMessage
				title="Fusion недоступен"
				body={fusionQuery.error.message}
				tone="warning"
				onRefresh={() => void fusionQuery.refetch()}
				refreshing={fusionQuery.isFetching}
			/>
		);
	}

	const result = fusionQuery.data;

	if (!result) {
		return (
			<FusionMessage
				title="Fusion не ответил"
				body="Нет данных от host-service."
				tone="warning"
				onRefresh={() => void fusionQuery.refetch()}
				refreshing={fusionQuery.isFetching}
			/>
		);
	}

	const cliStatus = result.status.cli;
	const centralProject = result.status.project;
	const localNode = result.status.node;
	const errors = [...result.status.errors, ...result.errors];

	return (
		<div className="flex h-full min-h-0 flex-col bg-background">
			<div className="shrink-0 border-b border-border px-3 py-2">
				<div className="flex items-center justify-between gap-2">
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<span className="truncate text-sm font-medium">Управление</span>
							<FusionStatusBadge available={result.available} />
						</div>
						<p className="mt-0.5 truncate text-xs text-muted-foreground">
							{cliStatus?.version ? `fn ${cliStatus.version}` : "CLI не найден"}
						</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 shrink-0"
						onClick={() => void fusionQuery.refetch()}
						disabled={fusionQuery.isFetching}
						aria-label="Обновить Fusion"
					>
						<RefreshCw
							className={cn(
								"size-3.5",
								fusionQuery.isFetching && "animate-spin",
							)}
						/>
					</Button>
				</div>
				<div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-muted-foreground">
					<FusionMeta label="Проект" value={centralProject?.name ?? "нет"} />
					<FusionMeta label="Node" value={localNode?.status ?? "нет"} />
					<FusionMeta label="Задачи" value={String(result.tasks.length)} />
					<FusionMeta
						label="DB"
						value={result.status.databases.project.exists ? "ready" : "missing"}
					/>
				</div>
			</div>

			{errors.length > 0 && (
				<div className="shrink-0 border-b border-border bg-destructive/5 px-3 py-2">
					<div className="flex items-start gap-2">
						<AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
						<div className="min-w-0 space-y-1">
							{errors.map((error) => (
								<p
									key={error}
									className="select-text break-words text-xs text-destructive"
								>
									{error}
								</p>
							))}
						</div>
					</div>
				</div>
			)}

			<div className="min-h-0 flex-1 overflow-y-auto">
				{result.tasks.length === 0 ? (
					<div className="px-3 py-8 text-center text-sm text-muted-foreground">
						Fusion задач нет.
					</div>
				) : (
					<div className="divide-y divide-border">
						{result.tasks.map((entry) => (
							<FusionTaskRow
								key={entry.task.sourceTaskId}
								entry={entry}
								onOpenChat={onOpenChat}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function FusionStatusBadge({ available }: { available: boolean }) {
	return (
		<Badge
			variant={available ? "secondary" : "outline"}
			className={cn(
				"h-5 rounded px-1.5 text-[10px]",
				available
					? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
					: "text-muted-foreground",
			)}
		>
			{available ? (
				<CheckCircle2 className="size-3" />
			) : (
				<AlertCircle className="size-3" />
			)}
			{available ? "готово" : "недоступно"}
		</Badge>
	);
}

function FusionMeta({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 rounded border border-border bg-muted/30 px-2 py-1">
			<div className="text-[10px] uppercase text-muted-foreground">{label}</div>
			<div className="truncate text-foreground">{value}</div>
		</div>
	);
}

function FusionTaskRow({
	entry,
	onOpenChat,
}: {
	entry: FusionTaskEntry;
	onOpenChat?: OpenChatFn;
}) {
	const stepSummary =
		entry.steps.length > 0
			? `${entry.steps.filter((step) => step.status === "succeeded").length}/${entry.steps.length} шагов`
			: "шагов нет";
	const priorityLabel =
		entry.task.labels
			.find((label) => label.startsWith("priority:"))
			?.replace("priority:", "") ?? null;

	return (
		<div className="px-3 py-2">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="truncate text-sm font-medium">{entry.task.title}</div>
					<div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
						<span>{entry.task.sourceTaskId}</span>
						<span aria-hidden="true">/</span>
						<span>{formatTaskStatus(entry.task.status)}</span>
						<span aria-hidden="true">/</span>
						<span>{stepSummary}</span>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					{priorityLabel && (
						<Badge
							variant="outline"
							className="h-5 shrink-0 rounded px-1.5 text-[10px]"
						>
							{priorityLabel}
						</Badge>
					)}
					<Button
						variant="outline"
						size="sm"
						className="h-6 gap-1 px-2 text-[11px]"
						onClick={() => {
							if (!onOpenChat) {
								toast.error("Запуск недоступен: чат workspace не подключен.");
								return;
							}
							onOpenChat(buildFusionTaskLaunch(entry));
						}}
					>
						<Play className="size-3" />
						Запустить
					</Button>
				</div>
			</div>
			{entry.task.labels.length > 0 && (
				<div className="mt-2 flex flex-wrap gap-1">
					{entry.task.labels.slice(0, 4).map((label) => (
						<span
							key={label}
							className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
						>
							{label}
						</span>
					))}
				</div>
			)}
		</div>
	);
}

function formatTaskStatus(status: FusionTaskEntry["task"]["status"]): string {
	switch (status) {
		case "backlog":
			return "backlog";
		case "todo":
			return "todo";
		case "planning":
			return "планирование";
		case "working":
			return "в работе";
		case "needs-feedback":
			return "нужен ответ";
		case "ready-to-merge":
			return "review";
		case "completed":
			return "готово";
		case "canceled":
			return "отменено";
		default:
			return status;
	}
}

function FusionMessage({
	title,
	body,
	tone,
	onRefresh,
	refreshing,
}: {
	title: string;
	body: string;
	tone: "warning" | "neutral";
	onRefresh?: () => void;
	refreshing?: boolean;
}) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
			<div
				className={cn(
					"flex size-9 items-center justify-center rounded border",
					tone === "warning"
						? "border-destructive/30 bg-destructive/5 text-destructive"
						: "border-border bg-muted text-muted-foreground",
				)}
			>
				<AlertCircle className="size-4" />
			</div>
			<div className="space-y-1">
				<div className="text-sm font-medium">{title}</div>
				<p className="select-text cursor-text break-words text-xs text-muted-foreground">
					{body}
				</p>
			</div>
			{onRefresh && (
				<Button
					variant="outline"
					size="sm"
					className="h-7"
					onClick={onRefresh}
					disabled={refreshing}
				>
					<RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
					Обновить
				</Button>
			)}
		</div>
	);
}

function FusionLoadingState() {
	return (
		<div className="space-y-2 p-3">
			<Skeleton className="h-12 w-full" />
			<Skeleton className="h-16 w-full" />
			<Skeleton className="h-16 w-full" />
		</div>
	);
}
