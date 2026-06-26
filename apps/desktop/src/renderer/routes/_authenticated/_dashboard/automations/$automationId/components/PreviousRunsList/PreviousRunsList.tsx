import type { SelectAutomationRun } from "@rox/db/schema";
import { Badge } from "@rox/ui/badge";
import {
	DrawnCheck,
	ease,
	motionDuration,
	Shake,
	StatusPulse,
	useShake,
	useShouldAnimate,
} from "@rox/ui/motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceStrict } from "date-fns";
import { ru } from "date-fns/locale";
import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useEffect } from "react";
import { useNow } from "renderer/hooks/useNow";
import {
	inferTrigger,
	RUN_STATUS_DOT,
	RUN_TRIGGER_LABEL,
	statusKindOf,
} from "../../../lib/runStatus";
import { formatRunDuration } from "../../../lib/scheduleRu";

/** Wraps a failure row with a one-shot shake on mount (essential tier). */
function FailureRow({ children }: { children: ReactNode }) {
	const { controls, trigger } = useShake();
	useEffect(() => {
		trigger();
	}, [trigger]);
	return <Shake controls={controls}>{children}</Shake>;
}

interface PreviousRunsListProps {
	runs: SelectAutomationRun[];
}

function formatAgo(date: Date, now: Date): string {
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
	if (seconds < 60) return "менее минуты назад";
	return `${formatDistanceStrict(date, now, { locale: ru })} назад`;
}

export function PreviousRunsList({ runs }: PreviousRunsListProps) {
	const navigate = useNavigate();
	const now = useNow();
	const animate = useShouldAnimate("essential");

	if (runs.length === 0) {
		return (
			<p className="text-sm italic text-muted-foreground">Запусков ещё нет</p>
		);
	}

	const handleOpenRun = (run: SelectAutomationRun) => {
		if (!run.v2WorkspaceId) return;
		localStorage.setItem("lastViewedWorkspaceId", run.v2WorkspaceId);
		navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: run.v2WorkspaceId },
			search: {
				terminalId: run.terminalSessionId ?? undefined,
				chatSessionId: run.chatSessionId ?? undefined,
			},
		});
	};

	return (
		<ul className="flex flex-col gap-0.5 text-sm">
			<AnimatePresence initial={false}>
				{runs.map((run, index) => {
					const clickable = !!run.v2WorkspaceId;
					const kind = statusKindOf(run.status);
					const trigger = inferTrigger(run);
					const duration = formatRunDuration(
						run.scheduledFor,
						run.dispatchedAt,
					);

					const statusIndicator =
						animate && run.status === "dispatching" ? (
							<StatusPulse colorClassName="bg-amber-500" className="shrink-0" />
						) : animate && run.status === "dispatched" ? (
							<DrawnCheck
								className="size-3 shrink-0 text-emerald-500"
								strokeWidth={3}
							/>
						) : (
							<span
								role="img"
								aria-label={run.status}
								className={cn(
									"inline-block size-2 shrink-0 rounded-full",
									RUN_STATUS_DOT[run.status],
								)}
							/>
						);

					const row = (
						<button
							type="button"
							disabled={!clickable}
							onClick={() => handleOpenRun(run)}
							className={cn(
								"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
								clickable
									? "cursor-pointer hover:bg-accent/40"
									: "cursor-default opacity-70",
							)}
						>
							{statusIndicator}
							<span className="truncate">{run.title || "Автоматизация"}</span>
							<Badge
								variant="outline"
								className="shrink-0 text-[9px] font-normal text-muted-foreground"
							>
								{RUN_TRIGGER_LABEL[trigger]}
							</Badge>
							{duration && (
								<span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
									{duration}
								</span>
							)}
							<span className="ml-auto shrink-0 truncate text-muted-foreground">
								{run.scheduledFor
									? formatAgo(new Date(run.scheduledFor), now)
									: "—"}
							</span>
						</button>
					);

					const inner = run.error ? (
						<Tooltip>
							<TooltipTrigger asChild>{row}</TooltipTrigger>
							<TooltipContent
								side="left"
								className="max-w-xs whitespace-pre-wrap"
							>
								{run.error}
							</TooltipContent>
						</Tooltip>
					) : (
						row
					);

					return (
						<motion.li
							key={run.id}
							layout
							initial={animate ? { opacity: 0, x: -8 } : false}
							animate={{ opacity: 1, x: 0 }}
							exit={animate ? { opacity: 0, x: -8 } : undefined}
							transition={{
								duration: motionDuration.fast,
								ease: ease.standard,
								delay: animate ? Math.min(index, 9) * 0.03 : 0,
							}}
						>
							{animate && kind === "failure" ? (
								<FailureRow>{inner}</FailureRow>
							) : (
								inner
							)}
						</motion.li>
					);
				})}
			</AnimatePresence>
		</ul>
	);
}
