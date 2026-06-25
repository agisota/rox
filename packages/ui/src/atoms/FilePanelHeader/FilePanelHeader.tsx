import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * One breadcrumb crumb. Pure data so the same header contract is reused by
 * desktop (worktree path), web, and mobile — none of them embed platform
 * handles here.
 */
export type FilePanelBreadcrumbSegment = {
	/** Stable key (e.g. the relative path up to this crumb). */
	id: string;
	/** Visible crumb text (e.g. "Workspace" for the root). */
	label: string;
	/** Optional click to navigate to this crumb's directory. */
	onClick?: () => void;
};

/** Tab descriptor for the Files / Artifacts(N) / Todos tablist. */
export type FilePanelTab = {
	id: string;
	label: string;
	/** Optional count rendered as "(N)" beside the label (e.g. Artifacts). */
	count?: number;
};

export type FilePanelHeaderProps = {
	/**
	 * Breadcrumb segments, root-first. The root crumb is conventionally
	 * "Workspace"; deeper crumbs reflect the current tree path.
	 */
	breadcrumb: FilePanelBreadcrumbSegment[];
	/**
	 * When true, a muted "•" hidden-indicator is shown after the breadcrumb to
	 * signal that hidden/ignored entries exist in the current view (F35 link).
	 */
	hiddenIndicator?: boolean;
	/** Optional git badge text (e.g. branch or dirty marker) — F35 link. */
	gitBadge?: string;
	/** Tablist entries: Files / Artifacts(N) / Todos. */
	tabs: FilePanelTab[];
	/** Currently-active tab id. */
	activeTab: string;
	/** Fired with the clicked tab id. */
	onTabChange: (id: string) => void;
	/**
	 * Icon-row rendered at the trailing edge of the tablist (parent / new file /
	 * new folder / refresh / upload / kebab / close). Supplied by the host so the
	 * presentational atom stays icon-library agnostic.
	 */
	actions?: ReactNode;
	className?: string;
};

function formatCount(count: number): string {
	return count > 99 ? "99+" : String(count);
}

/**
 * Presentational header for a file panel: a breadcrumb row (root "Workspace"
 * crumb, optional hidden-indicator + git badge) above a Files/Artifacts/Todos
 * tablist with a trailing icon-row slot.
 *
 * Cross-platform: this atom is pure presentation — it owns no filesystem,
 * tRPC, or platform handles. Desktop wires the live data + lucide icons into
 * the `actions` slot and the breadcrumb/tab callbacks; web and mobile reuse the
 * same contract.
 */
export function FilePanelHeader({
	breadcrumb,
	hiddenIndicator,
	gitBadge,
	tabs,
	activeTab,
	onTabChange,
	actions,
	className,
}: FilePanelHeaderProps) {
	return (
		<div
			className={cn("flex shrink-0 flex-col border-b border-border", className)}
		>
			<div className="flex h-6 items-center gap-1 px-2 text-xs text-muted-foreground">
				<nav
					aria-label="Breadcrumb"
					className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
				>
					{breadcrumb.map((segment, index) => (
						<span key={segment.id} className="flex min-w-0 items-center gap-1">
							{index > 0 && (
								<span aria-hidden className="text-muted-foreground/50">
									/
								</span>
							)}
							{segment.onClick ? (
								<button
									type="button"
									onClick={segment.onClick}
									className="max-w-[12rem] truncate rounded-sm px-0.5 hover:text-foreground"
								>
									{segment.label}
								</button>
							) : (
								<span className="max-w-[12rem] truncate px-0.5 text-foreground">
									{segment.label}
								</span>
							)}
						</span>
					))}
				</nav>
				{hiddenIndicator && (
					<span
						role="img"
						aria-label="Скрытые элементы"
						title="Есть скрытые элементы"
						className="shrink-0 text-muted-foreground/60"
					>
						•
					</span>
				)}
				{gitBadge && (
					<span className="shrink-0 truncate rounded-sm bg-border/40 px-1 font-mono text-[10px] text-muted-foreground">
						{gitBadge}
					</span>
				)}
			</div>
			<div className="flex h-8 items-stretch">
				<div
					role="tablist"
					aria-label="File panel"
					className="flex min-w-0 items-stretch overflow-hidden"
				>
					{tabs.map((tab) => {
						const isActive = tab.id === activeTab;
						const count =
							typeof tab.count === "number" && tab.count > 0
								? formatCount(tab.count)
								: null;
						return (
							<button
								key={tab.id}
								type="button"
								role="tab"
								aria-selected={isActive}
								onClick={() => onTabChange(tab.id)}
								className={cn(
									"flex shrink-0 items-center gap-1 px-3 text-xs transition-all",
									isActive
										? "bg-border/30 text-foreground"
										: "text-muted-foreground/70 hover:bg-tertiary/20 hover:text-muted-foreground",
								)}
							>
								<span className="truncate">{tab.label}</span>
								{count && (
									<span className="text-muted-foreground/70">({count})</span>
								)}
							</button>
						);
					})}
				</div>
				<div className="flex-1" />
				{actions && (
					<div className="flex shrink-0 items-center gap-0.5 pr-2">
						{actions}
					</div>
				)}
			</div>
		</div>
	);
}
