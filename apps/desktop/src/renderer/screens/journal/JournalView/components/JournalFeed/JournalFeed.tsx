import type { SelectJournalEvent } from "@rox/db/schema";
import { cn } from "@rox/ui/utils";

const KIND_LABELS: Record<string, string> = {
	automation_run: "Автоматизация",
};

const STATUS_DOT: Record<string, string> = {
	dispatched: "bg-emerald-500",
	skipped_offline: "bg-muted-foreground",
	dispatch_failed: "bg-red-500",
	conflict: "bg-muted-foreground",
};

function eventStatus(event: SelectJournalEvent): string | undefined {
	const status = (event.payload as { status?: unknown } | null)?.status;
	return typeof status === "string" ? status : undefined;
}

function formatTimestamp(value: Date | string): string {
	const date = typeof value === "string" ? new Date(value) : value;
	const now = Date.now();
	const diffMs = now - date.getTime();
	const diffMin = Math.round(diffMs / 60_000);

	if (diffMin < 1) return "только что";
	if (diffMin < 60) return `${diffMin} мин назад`;
	const diffHr = Math.round(diffMin / 60);
	if (diffHr < 24) return `${diffHr} ч назад`;

	return date.toLocaleString("ru-RU", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "UTC",
	});
}

interface JournalFeedProps {
	events: SelectJournalEvent[];
}

/**
 * The continuous (24/7) event lane. Each row is one automation run, appended
 * minute-by-minute by the dispatcher. Newest first.
 */
export function JournalFeed({ events }: JournalFeedProps) {
	if (events.length === 0) {
		return <JournalFeedEmpty />;
	}

	return (
		<ol className="space-y-2">
			{events.map((event) => {
				const status = eventStatus(event);
				return (
					<li
						key={event.id}
						className="flex items-start gap-3 rounded-md border border-border bg-card/40 p-3"
					>
						<span
							className={cn(
								"mt-1.5 size-2 shrink-0 rounded-full",
								(status && STATUS_DOT[status]) ?? "bg-muted-foreground",
							)}
							aria-hidden
						/>
						<div className="min-w-0 flex-1">
							<div className="flex items-baseline justify-between gap-3">
								<span className="truncate font-medium text-foreground text-sm">
									{event.title}
								</span>
								<time className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
									{formatTimestamp(event.createdAt)}
								</time>
							</div>
							{event.summary && (
								<p className="mt-0.5 truncate text-muted-foreground text-xs">
									{event.summary}
								</p>
							)}
						</div>
						<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
							{KIND_LABELS[event.kind] ?? event.kind}
						</span>
					</li>
				);
			})}
		</ol>
	);
}

function JournalFeedEmpty() {
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-border border-dashed py-20 text-center">
			<span className="text-foreground text-sm">Лента пока пуста</span>
			<span className="mt-1 max-w-sm text-muted-foreground text-xs">
				Здесь в реальном времени появляются события автоматизаций — каждый
				запуск добавляет запись.
			</span>
		</div>
	);
}
