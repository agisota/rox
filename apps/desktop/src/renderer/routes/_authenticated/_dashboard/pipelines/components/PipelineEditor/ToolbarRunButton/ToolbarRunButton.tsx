import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";
import { useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";

/** A run is "live" while queued/running/waiting — poll those for status. */
const LIVE_RUN_STATUSES = new Set(["queued", "running", "waiting_approval"]);

function statusVariant(
	status: string,
): "default" | "secondary" | "destructive" | "outline" {
	if (status === "succeeded") return "default";
	if (status === "failed" || status === "timeout") return "destructive";
	if (status === "running" || status === "queued") return "secondary";
	return "outline";
}

type ToolbarRunButtonProps = {
	pipelineId: string;
	/** Number of validation errors; >0 disables the run with a tooltip. */
	problemCount: number;
	/** Whether a graph save is mid-flight (block running a half-saved graph). */
	saveInFlight: boolean;
	/** Called with the new run id so the editor can light up the canvas trace. */
	onRunStarted: (runId: string) => void;
};

/**
 * Toolbar "▶ Запустить" affordance. Opens a popover with a seed-message textarea
 * and fires `pipeline.runOnce`. Disabled (with an explanatory tooltip) while the
 * live graph is invalid or a save is in flight — the client gate mirrors the
 * server's "Cannot run an invalid pipeline graph" 400 so the user never round-
 * trips just to be rejected. Duplicates RunMonitorPanel's run action but makes it
 * reachable from anywhere in the editor (dify/sim parity).
 */
export function ToolbarRunButton({
	pipelineId,
	problemCount,
	saveInFlight,
	onRunStarted,
}: ToolbarRunButtonProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [seedMessage, setSeedMessage] = useState("");
	// The run launched from THIS toolbar, surfaced inline in the popover so a run
	// started here is not output-blind (the full trace also lives in the Runs tab).
	const [lastRunId, setLastRunId] = useState<string | null>(null);

	// Live status + final output/error of the toolbar-launched run. Cache-first:
	// renders from whatever is cached; polls only while the run is in a live state.
	const runDetailQuery = useQuery({
		...trpc.pipeline.getRun.queryOptions({
			pipelineId,
			runId: lastRunId ?? "",
		}),
		enabled: lastRunId != null,
		refetchInterval: (query) => {
			const status = query.state.data?.run.status;
			return status && LIVE_RUN_STATUSES.has(status) ? 1500 : false;
		},
	});
	const detail = runDetailQuery.data;

	const runOnce = useMutation(
		trpc.pipeline.runOnce.mutationOptions({
			onSuccess: async (result) => {
				setSeedMessage("");
				setLastRunId(result.runId);
				onRunStarted(result.runId);
				await queryClient.invalidateQueries({
					queryKey: trpc.pipeline.listRuns.queryKey({ pipelineId, limit: 20 }),
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
				logger.error("[ToolbarRunButton] runOnce failed", error);
				toast.error("Не удалось запустить пайплайн");
			},
		}),
	);

	const invalid = problemCount > 0;
	const disabled = invalid || saveInFlight;
	const disabledReason = invalid
		? `${problemCount} проблем(ы) — исправьте перед запуском`
		: saveInFlight
			? "Идёт сохранение графа…"
			: undefined;

	// When disabled we keep the trigger a real (focusable) button so the tooltip
	// still works and the keyboard flow is intact — we use `aria-disabled` +
	// visual muting + an inert onClick instead of the native `disabled` attr
	// (which would swallow the pointer events the tooltip needs).
	if (disabled) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						size="sm"
						type="button"
						aria-disabled
						aria-label="Запустить пайплайн (недоступно)"
						className="gap-1 opacity-50"
						onClick={(e) => e.preventDefault()}
					>
						<Play className="size-3.5" /> Запустить
					</Button>
				</TooltipTrigger>
				<TooltipContent className="select-text">
					{disabledReason}
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button size="sm" className="gap-1" aria-label="Запустить пайплайн">
					<Play className="size-3.5" /> Запустить
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="flex w-80 flex-col gap-2">
				<p className="text-xs font-medium">Запуск пайплайна</p>
				<Textarea
					value={seedMessage}
					onChange={(e) => setSeedMessage(e.target.value)}
					placeholder="Сообщение, с которого начнётся пайплайн…"
					className="min-h-20 text-xs"
					aria-label="Стартовое сообщение"
				/>
				<Button
					size="sm"
					disabled={runOnce.isPending || seedMessage.trim().length === 0}
					onClick={() =>
						runOnce.mutate({
							pipelineId,
							seedMessage: seedMessage.trim(),
							input: {},
						})
					}
				>
					{runOnce.isPending ? (
						<Loader2 className="size-3.5 animate-spin" />
					) : (
						<Play className="size-3.5" />
					)}
					Запустить
				</Button>

				{/* Inline run state/output for the toolbar-launched run (dify parity:
				    a run started here surfaces its result without switching tabs). */}
				{lastRunId && detail && (
					<div className="flex flex-col gap-1.5 rounded-md border bg-card p-2">
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs font-medium">Результат запуска</span>
							<Badge variant={statusVariant(detail.run.status)}>
								{detail.run.status}
							</Badge>
						</div>
						{detail.run.error && (
							<p className="select-text text-[11px] text-destructive">
								{detail.run.error.message ?? "Ошибка выполнения"}
							</p>
						)}
						{detail.run.output != null && (
							<pre className="max-h-32 overflow-auto rounded bg-muted/40 p-1.5 text-[10px] leading-snug">
								{JSON.stringify(detail.run.output, null, 2)}
							</pre>
						)}
						{!detail.run.error &&
							detail.run.output == null &&
							LIVE_RUN_STATUSES.has(detail.run.status) && (
								<p className="flex items-center gap-1 text-[11px] text-muted-foreground">
									<Loader2 className="size-3 animate-spin" /> выполняется…
								</p>
							)}
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
