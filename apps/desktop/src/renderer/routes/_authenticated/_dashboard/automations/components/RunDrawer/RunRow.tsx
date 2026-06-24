import type { SelectAutomationRun } from "@rox/db/schema";
import { formatDateTimeInTimezone } from "@rox/shared/rrule";
import {
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@rox/ui/accordion";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	DrawnCheck,
	Shake,
	StatusPulse,
	useShake,
	useShouldAnimate,
} from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceStrict } from "date-fns";
import { ru } from "date-fns/locale";
import { type ReactNode, useEffect } from "react";
import { LuExternalLink, LuRotateCw } from "react-icons/lu";
import { useNow } from "renderer/hooks/useNow";
import {
	inferTrigger,
	RUN_STATUS_DOT,
	RUN_STATUS_LABEL,
	RUN_TRIGGER_LABEL,
	statusKindOf,
} from "../../lib/runStatus";
import { formatRunDuration } from "../../lib/scheduleRu";

/** One-shot shake on mount for newly-surfaced failures (essential tier). */
function FailureShake({ children }: { children: ReactNode }) {
	const { controls, trigger } = useShake();
	useEffect(() => {
		trigger();
	}, [trigger]);
	return <Shake controls={controls}>{children}</Shake>;
}

function formatAgo(date: Date, now: Date): string {
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
	if (seconds < 60) return "менее минуты назад";
	return `${formatDistanceStrict(date, now, { locale: ru })} назад`;
}

interface RunRowProps {
	run: SelectAutomationRun;
	timezone: string;
	hostName?: string;
	/** True while this run's optimistic rerun is in flight. */
	rerunning?: boolean;
	onRerun: (run: SelectAutomationRun) => void;
}

export function RunRow({
	run,
	timezone,
	hostName,
	rerunning,
	onRerun,
}: RunRowProps) {
	const navigate = useNavigate();
	const now = useNow();
	const animate = useShouldAnimate("essential");

	const kind = statusKindOf(run.status);
	const trigger = inferTrigger(run);
	const duration = formatRunDuration(run.scheduledFor, run.dispatchedAt);
	const clickable = !!run.v2WorkspaceId;

	const indicator =
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
				aria-label={RUN_STATUS_LABEL[run.status]}
				className={cn(
					"inline-block size-2 shrink-0 rounded-full",
					RUN_STATUS_DOT[run.status],
				)}
			/>
		);

	const handleOpenRun = () => {
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

	const header = (
		<AccordionTrigger className="px-3 hover:no-underline">
			<span className="flex min-w-0 flex-1 items-center gap-2.5 text-sm">
				{indicator}
				<span className="min-w-0 truncate font-medium">
					{run.title || "Автоматизация"}
				</span>
				<Badge
					variant="outline"
					className="shrink-0 text-[10px] font-normal text-muted-foreground"
				>
					{RUN_TRIGGER_LABEL[trigger]}
				</Badge>
				<span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
					{duration ?? "—"}
				</span>
				<span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
					{run.scheduledFor ? formatAgo(new Date(run.scheduledFor), now) : "—"}
				</span>
			</span>
		</AccordionTrigger>
	);

	return (
		<AccordionItem
			value={run.id}
			className="rounded-md border border-border/60 bg-card/40"
		>
			{animate && kind === "failure" ? (
				<FailureShake>{header}</FailureShake>
			) : (
				header
			)}

			<AccordionContent className="px-3">
				<div className="flex flex-col gap-3 pt-1">
					<dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
						<dt className="text-muted-foreground">Статус</dt>
						<dd className="font-medium">{RUN_STATUS_LABEL[run.status]}</dd>

						<dt className="text-muted-foreground">Запланировано</dt>
						<dd className="font-mono">
							{run.scheduledFor
								? formatDateTimeInTimezone(
										new Date(run.scheduledFor),
										timezone,
										{ locale: "ru" },
									)
								: "—"}
						</dd>

						<dt className="text-muted-foreground">Отправлено</dt>
						<dd className="font-mono">
							{run.dispatchedAt
								? formatDateTimeInTimezone(
										new Date(run.dispatchedAt),
										timezone,
										{ locale: "ru" },
									)
								: "—"}
						</dd>

						{duration && (
							<>
								<dt className="text-muted-foreground">Длительность</dt>
								<dd className="font-mono">{duration}</dd>
							</>
						)}

						<dt className="text-muted-foreground">Устройство</dt>
						<dd className="truncate">{hostName ?? run.hostId ?? "Авто"}</dd>

						{run.sessionKind && (
							<>
								<dt className="text-muted-foreground">Тип сессии</dt>
								<dd className="font-mono">{run.sessionKind}</dd>
							</>
						)}
					</dl>

					{run.error && (
						<div className="flex flex-col gap-1">
							<span className="text-xs font-medium text-destructive">
								Ошибка
							</span>
							<pre className="max-h-48 cursor-text select-text overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-destructive">
								{run.error}
							</pre>
						</div>
					)}

					<div className="flex items-center gap-2 pt-0.5">
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 gap-1.5 text-xs"
							disabled={!clickable}
							title={
								clickable
									? undefined
									: "У этого запуска нет связанного рабочего пространства"
							}
							onClick={handleOpenRun}
						>
							<LuExternalLink className="size-3.5" />
							Открыть запуск
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 gap-1.5 text-xs"
							disabled={rerunning}
							onClick={() => onRerun(run)}
						>
							<LuRotateCw
								className={cn("size-3.5", rerunning && "animate-spin")}
							/>
							Повторить
						</Button>
					</div>
				</div>
			</AccordionContent>
		</AccordionItem>
	);
}
