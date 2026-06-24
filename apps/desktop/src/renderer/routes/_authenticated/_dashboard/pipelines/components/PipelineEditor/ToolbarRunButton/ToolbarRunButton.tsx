import { Button } from "@rox/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";
import { useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";

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

	const runOnce = useMutation(
		trpc.pipeline.runOnce.mutationOptions({
			onSuccess: async (result) => {
				setOpen(false);
				setSeedMessage("");
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
			</PopoverContent>
		</Popover>
	);
}
