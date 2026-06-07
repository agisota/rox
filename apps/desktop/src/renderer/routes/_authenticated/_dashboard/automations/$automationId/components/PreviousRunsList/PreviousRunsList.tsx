import type { SelectAutomationRun } from "@rox/db/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceStrict } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useEffect } from "react";
import { useNow } from "renderer/hooks/useNow";
import {
	DrawnCheck,
	ease,
	motionDuration,
	Shake,
	StatusPulse,
	useShake,
	useShouldAnimate,
} from "renderer/motion";

const STATUS_DOT: Record<SelectAutomationRun["status"], string> = {
	dispatched: "bg-emerald-500",
	dispatching: "bg-amber-500",
	skipped_offline: "bg-red-500",
	dispatch_failed: "bg-red-500",
};

type StatusKind = "success" | "failure" | "pending";

function statusKindOf(status: SelectAutomationRun["status"]): StatusKind {
	if (status === "dispatched") return "success";
	if (status === "dispatch_failed" || status === "skipped_offline")
		return "failure";
	return "pending";
}

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
	if (seconds < 60) return "less than a minute ago";
	return `${formatDistanceStrict(date, now)} ago`;
}

export function PreviousRunsList({ runs }: PreviousRunsListProps) {
	const navigate = useNavigate();
	const now = useNow();
	const animate = useShouldAnimate("essential");

	if (runs.length === 0) {
		return <p className="text-sm italic text-muted-foreground">No runs yet</p>;
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
									STATUS_DOT[run.status],
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
							<span className="truncate">{run.title || "Automation"}</span>
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
