import type { SelectJournalEvent } from "@rox/db/schema";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Separator } from "@rox/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@rox/ui/sheet";
import { cn } from "@rox/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuArrowRight, LuExternalLink } from "react-icons/lu";
import { absoluteTime, relativeTime } from "../datetime";
import { KIND_LABELS, statusDotClass, statusLabel } from "../status";
import { eventStatus } from "../types";

interface EventDrawerProps {
	event: SelectJournalEvent | null;
	onClose: () => void;
}

/** Known payload fields we surface as readable rows (everything else is JSON). */
const KNOWN_PAYLOAD_FIELDS = new Set([
	"status",
	"source",
	"agent",
	"scheduledFor",
	"error",
	"sessionKind",
]);

const FIELD_LABELS: Record<string, string> = {
	agent: "Агент",
	scheduledFor: "Запланировано",
	sessionKind: "Тип сессии",
	error: "Ошибка",
	source: "Источник",
};

/**
 * Right-side drill-down for a single feed event. Parses the structured
 * `payload` into readable rows and exposes context navigation into the source
 * Automation / run. Buttons degrade to disabled when the link is absent
 * (mirrors the PR/issue side-panel pattern).
 */
export function EventDrawer({ event, onClose }: EventDrawerProps) {
	const navigate = useNavigate();
	const open = event !== null;

	return (
		<Sheet open={open} onOpenChange={(next) => !next && onClose()}>
			<SheetContent
				side="right"
				className="border-border/60 border-l bg-background/95 backdrop-blur-md sm:max-w-md"
			>
				{event && (
					<EventDrawerBody
						event={event}
						onOpenAutomation={() => {
							if (!event.automationId) return;
							onClose();
							void navigate({
								to: "/automations/$automationId",
								params: { automationId: event.automationId },
							});
						}}
					/>
				)}
			</SheetContent>
		</Sheet>
	);
}

function EventDrawerBody({
	event,
	onOpenAutomation,
}: {
	event: SelectJournalEvent;
	onOpenAutomation: () => void;
}) {
	const status = eventStatus(event);
	const payload = (event.payload ?? {}) as Record<string, unknown>;
	const error = typeof payload.error === "string" ? payload.error : undefined;

	const detailRows = Object.entries(payload).filter(
		([key, value]) =>
			KNOWN_PAYLOAD_FIELDS.has(key) &&
			key !== "status" &&
			key !== "error" &&
			(typeof value === "string" ||
				typeof value === "number" ||
				typeof value === "boolean"),
	);
	const extraKeys = Object.keys(payload).filter(
		(key) => !KNOWN_PAYLOAD_FIELDS.has(key),
	);

	return (
		<>
			<SheetHeader className="gap-2">
				<div className="flex items-center gap-2">
					<span
						className={cn(
							"size-2.5 shrink-0 rounded-full",
							statusDotClass(status),
						)}
						aria-hidden
					/>
					<Badge variant="outline" className="text-[10px]">
						{KIND_LABELS[event.kind] ?? event.kind}
					</Badge>
					<span className="text-muted-foreground text-xs">
						{statusLabel(status)}
					</span>
				</div>
				<SheetTitle className="text-base leading-tight">
					{event.title}
				</SheetTitle>
				<SheetDescription className="font-mono text-[11px] tabular-nums">
					{relativeTime(event.createdAt)} · {absoluteTime(event.createdAt)}
				</SheetDescription>
			</SheetHeader>

			<div className="flex-1 overflow-y-auto px-4">
				{event.summary && (
					<p className="text-foreground text-sm leading-relaxed">
						{event.summary}
					</p>
				)}

				{error && (
					<div className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-3">
						<p className="font-semibold text-[11px] text-red-500 uppercase tracking-wider">
							Ошибка
						</p>
						<p className="mt-1 whitespace-pre-wrap break-words text-foreground text-xs">
							{error}
						</p>
					</div>
				)}

				{detailRows.length > 0 && (
					<dl className="mt-4 space-y-2">
						{detailRows.map(([key, value]) => (
							<div
								key={key}
								className="flex items-baseline justify-between gap-3 border-border/40 border-b pb-2 last:border-0"
							>
								<dt className="shrink-0 text-muted-foreground text-xs">
									{FIELD_LABELS[key] ?? key}
								</dt>
								<dd className="truncate font-mono text-foreground text-xs tabular-nums">
									{String(value)}
								</dd>
							</div>
						))}
					</dl>
				)}

				{extraKeys.length > 0 && (
					<details className="mt-4">
						<summary className="cursor-pointer text-muted-foreground text-xs hover:text-foreground">
							Полезная нагрузка (JSON)
						</summary>
						<pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border/50 bg-card/40 p-2.5 font-mono text-[11px] text-muted-foreground leading-relaxed">
							{JSON.stringify(payload, null, 2)}
						</pre>
					</details>
				)}
			</div>

			<Separator className="bg-border/50" />
			<div className="flex flex-col gap-2 p-4">
				<Button
					variant="outline"
					size="sm"
					className="justify-between"
					disabled={!event.automationId}
					onClick={onOpenAutomation}
				>
					Открыть автоматизацию
					<LuArrowRight className="size-4" />
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="justify-between text-muted-foreground"
					disabled={!event.automationRunId}
					onClick={onOpenAutomation}
				>
					К запуску
					<LuExternalLink className="size-4" />
				</Button>
				{!event.automationId && !event.automationRunId && (
					<p className="text-center text-[11px] text-muted-foreground">
						У события нет связанной автоматизации
					</p>
				)}
			</div>
		</>
	);
}
