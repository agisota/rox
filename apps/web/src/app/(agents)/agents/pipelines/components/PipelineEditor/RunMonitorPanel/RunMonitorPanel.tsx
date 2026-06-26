"use client";

import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { ScrollArea } from "@rox/ui/scroll-area";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDot, Loader2, Play } from "lucide-react";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";

/** A run is "live" while queued/running/waiting — poll those for step updates. */
const LIVE_RUN_STATUSES = new Set(["queued", "running", "waiting_approval"]);

function statusVariant(
	status: string,
): "default" | "secondary" | "destructive" | "outline" {
	if (status === "succeeded") return "default";
	if (status === "failed" || status === "timeout") return "destructive";
	if (status === "running" || status === "queued") return "secondary";
	return "outline";
}

type RunMonitorPanelProps = {
	pipelineId: string;
	/** The run currently visualised on the canvas (lifted to the editor). */
	activeRunId: string | null;
	/** Select a run (updates the shared canvas trace + this panel). */
	onSelectRun: (runId: string | null) => void;
};

/**
 * The run monitor: triggers a one-off pipeline run (`pipeline.runOnce`), lists
 * recent runs (`pipeline.listRuns`), and live-polls the selected/active run's
 * steps (`pipeline.getRun`) for status.
 *
 * The active run id is lifted to the editor (`activeRunId`/`onSelectRun`) so the
 * panel, the toolbar run button, and the on-canvas run trace all agree on the
 * watched run.
 *
 * Cache-first (AGENTS.md rule 9): persisted runs/steps render immediately; the
 * `isLoading` branches only show when there is no data yet. Polling is enabled
 * only while a run is in a live status, so finished runs stop refetching.
 */
export function RunMonitorPanel({
	pipelineId,
	activeRunId,
	onSelectRun,
}: RunMonitorPanelProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [seedMessage, setSeedMessage] = useState("");

	const runsInput = { pipelineId, limit: 20 };
	const runsQuery = useQuery({
		...trpc.pipeline.listRuns.queryOptions(runsInput),
		refetchInterval: (query) => {
			const rows = query.state.data ?? [];
			return rows.some((r) => LIVE_RUN_STATUSES.has(r.status)) ? 2000 : false;
		},
	});

	const runDetailQuery = useQuery({
		...trpc.pipeline.getRun.queryOptions({
			pipelineId,
			runId: activeRunId ?? "",
		}),
		enabled: activeRunId != null,
		refetchInterval: (query) => {
			const status = query.state.data?.run.status;
			return status && LIVE_RUN_STATUSES.has(status) ? 1500 : false;
		},
	});

	const runOnceMutation = useMutation(
		trpc.pipeline.runOnce.mutationOptions({
			onSuccess: async (result) => {
				onSelectRun(result.runId);
				await queryClient.invalidateQueries({
					queryKey: trpc.pipeline.listRuns.queryKey(runsInput),
				});
				if (result.status === "waiting_approval") {
					toast.info("Пайплайн ждёт подтверждения");
				} else if (result.status === "failed") {
					toast.error("Пайплайн завершился с ошибкой");
				} else {
					toast.success("Запуск пайплайна создан");
				}
			},
			onError: (error) => {
				console.error("[RunMonitorPanel] runOnce failed", error);
				toast.error("Не удалось запустить пайплайн");
			},
		}),
	);

	const runs = runsQuery.data ?? [];
	const detail = runDetailQuery.data;

	return (
		<div className="flex h-full flex-col gap-3 p-3">
			<h2 className="text-sm font-medium">Запуск и мониторинг</h2>

			<div className="flex flex-col gap-2 rounded-md border bg-card p-2">
				<Textarea
					value={seedMessage}
					onChange={(e) => setSeedMessage(e.target.value)}
					placeholder="Сообщение, с которого начнётся пайплайн…"
					className="min-h-16 text-xs"
					aria-label="Стартовое сообщение"
				/>
				<Button
					size="sm"
					disabled={
						runOnceMutation.isPending || seedMessage.trim().length === 0
					}
					onClick={() =>
						runOnceMutation.mutate({
							pipelineId,
							seedMessage: seedMessage.trim(),
							input: {},
						})
					}
				>
					{runOnceMutation.isPending ? (
						<Loader2 className="size-3.5 animate-spin" />
					) : (
						<Play className="size-3.5" />
					)}
					Запустить
				</Button>
			</div>

			<ScrollArea className="flex-1">
				<div className="flex flex-col gap-3 pr-2">
					{/* Active run step trace */}
					{activeRunId && detail && (
						<div className="rounded-md border bg-card p-2">
							<div className="mb-2 flex items-center justify-between">
								<span className="text-xs font-medium">Текущий запуск</span>
								<Badge variant={statusVariant(detail.run.status)}>
									{detail.run.status}
								</Badge>
							</div>
							<ol className="flex flex-col gap-1">
								{detail.steps.map((step) => (
									<li key={step.id} className="flex items-center gap-2 text-xs">
										<CircleDot
											className={`size-3 ${
												step.status === "succeeded"
													? "text-emerald-500"
													: step.status === "failed"
														? "text-destructive"
														: step.status === "running"
															? "text-sky-500"
															: "text-muted-foreground"
											}`}
										/>
										<span className="flex-1 truncate">
											{step.blockName ?? step.blockId}
										</span>
										<span className="text-muted-foreground">{step.status}</span>
									</li>
								))}
								{detail.steps.length === 0 && (
									<li className="text-xs text-muted-foreground">
										Шаги ещё не записаны…
									</li>
								)}
							</ol>
						</div>
					)}

					{/* Recent runs */}
					<div className="flex items-center gap-2">
						<span className="text-xs font-medium text-muted-foreground">
							История запусков
						</span>
						<div className="h-px flex-1 bg-border" />
					</div>
					{runsQuery.isError && (
						<div className="rounded-md border border-destructive/40 p-2">
							<p className="select-text cursor-text text-xs text-destructive">
								{runsQuery.error.message}
							</p>
							<Button
								size="sm"
								variant="outline"
								className="mt-2 h-7 text-xs"
								onClick={() => runsQuery.refetch()}
							>
								Повторить
							</Button>
						</div>
					)}
					{runs.length === 0 && !runsQuery.isLoading && !runsQuery.isError && (
						<p className="text-xs text-muted-foreground">
							Запусков ещё не было.
						</p>
					)}
					{runs.map((run) => (
						<RunHistoryButton
							key={run.id}
							status={run.status}
							createdAt={run.createdAt}
							selected={run.id === activeRunId}
							onClick={() => onSelectRun(run.id)}
						/>
					))}
				</div>
			</ScrollArea>
		</div>
	);
}

function RunHistoryButton({
	status,
	createdAt,
	selected,
	onClick,
}: {
	status: string;
	createdAt: Date | string;
	selected: boolean;
	onClick: () => void;
}) {
	const createdAtLabel = new Date(createdAt).toLocaleString("ru-RU");

	return (
		<button
			type="button"
			aria-pressed={selected}
			aria-label={`Открыть запуск от ${createdAtLabel}, статус ${status}`}
			onClick={onClick}
			className={`flex items-center gap-2 rounded-md border p-2 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
				selected ? "border-primary" : "bg-card"
			}`}
		>
			<Badge variant={statusVariant(status)} className="text-[10px]">
				{status}
			</Badge>
			<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
				{createdAtLabel}
			</span>
		</button>
	);
}
