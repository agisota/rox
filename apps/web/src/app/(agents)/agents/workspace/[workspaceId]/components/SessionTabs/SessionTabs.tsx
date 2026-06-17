"use client";

import { cn } from "@rox/ui/utils";

/** The view rendered in the session canvas. */
export type SessionView = "chat" | "map" | "flow" | "atlas" | "diff";

type ViewConfig = {
	id: SessionView;
	label: string;
	tabId: string;
	panelId: string;
};

export const sessionViews: ViewConfig[] = [
	{
		id: "chat",
		label: "Чат",
		tabId: "session-tab-chat",
		panelId: "session-panel-chat",
	},
	{
		id: "map",
		label: "Карта",
		tabId: "session-tab-map",
		panelId: "session-panel-map",
	},
	{
		id: "flow",
		label: "Поток",
		tabId: "session-tab-flow",
		panelId: "session-panel-flow",
	},
	{
		id: "atlas",
		label: "Атлас",
		tabId: "session-tab-atlas",
		panelId: "session-panel-atlas",
	},
	{
		id: "diff",
		label: "Изменения",
		tabId: "session-tab-diff",
		panelId: "session-panel-diff",
	},
];

type SessionTabsProps = {
	activeView: SessionView;
	onViewChange: (view: SessionView) => void;
};

export function SessionTabs({ activeView, onViewChange }: SessionTabsProps) {
	return (
		<div
			role="tablist"
			aria-label="Просмотр сессии"
			className="flex shrink-0 border-b border-border px-4"
		>
			{sessionViews.map((view) => {
				const isActive = activeView === view.id;
				return (
					<button
						key={view.id}
						type="button"
						role="tab"
						id={view.tabId}
						aria-selected={isActive}
						aria-controls={view.panelId}
						tabIndex={isActive ? 0 : -1}
						onClick={() => onViewChange(view.id)}
						className={cn(
							"relative px-4 py-2 text-sm font-medium transition-colors",
							isActive
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{view.label}
						{isActive && (
							<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
						)}
					</button>
				);
			})}
		</div>
	);
}
