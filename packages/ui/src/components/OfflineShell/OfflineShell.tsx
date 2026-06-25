"use client";

/**
 * OfflineShell — the cross-platform "you're offline" surface (F50, #645).
 *
 * Pure presentational and framework-agnostic (no service-worker / navigator
 * import), so the same shell renders for the web PWA offline fallback page, and
 * the pattern is reusable on desktop/mobile when a host loses connectivity. The
 * caller decides *when* it is mounted (web: the SW `/~offline` fallback route)
 * and passes the localized copy; this component only lays it out.
 *
 * `pendingCount` surfaces the F46 offline queue depth so a user knows their
 * edits are safely buffered and will sync — it is hidden when zero.
 */

import { CloudOff } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export interface OfflineShellProps {
	/** Heading line. */
	title?: string;
	/** Supporting explanation under the heading. */
	description?: string;
	/**
	 * Count of edits buffered in the offline queue (F46). When > 0 a reassurance
	 * line is shown; hidden at 0 so a read-only offline view stays quiet.
	 */
	pendingCount?: number;
	/** Localized "{n} change(s) waiting to sync" renderer for `pendingCount`. */
	renderPending?: (count: number) => ReactNode;
	/** Optional action slot (e.g. a "Retry" button supplied by the host). */
	action?: ReactNode;
	className?: string;
}

/** Full-bleed offline shell card; presentational, no network access. */
export function OfflineShell({
	title = "Нет подключения",
	description = "Приложение работает офлайн. Открытые экраны доступны, а изменения сохранятся и синхронизируются после восстановления связи.",
	pendingCount = 0,
	renderPending,
	action,
	className,
}: OfflineShellProps) {
	const showPending = pendingCount > 0;

	return (
		<div
			className={cn(
				"bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-6 px-8 text-center",
				className,
			)}
			data-slot="offline-shell"
			data-pending={showPending ? "true" : "false"}
		>
			<CloudOff
				className="text-muted-foreground size-12"
				aria-hidden="true"
				data-slot="offline-glyph"
			/>
			<div className="max-w-md space-y-2">
				<h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
				<p className="text-muted-foreground text-pretty text-sm leading-relaxed">
					{description}
				</p>
			</div>
			{showPending ? (
				<p
					className="text-muted-foreground text-xs"
					data-slot="offline-pending"
					data-count={pendingCount}
				>
					{renderPending
						? renderPending(pendingCount)
						: `Изменений в очереди: ${pendingCount}`}
				</p>
			) : null}
			{action ? <div data-slot="offline-action">{action}</div> : null}
		</div>
	);
}
