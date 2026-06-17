"use client";

import { cn } from "@rox/ui/utils";
import { type KeyboardEvent, useRef } from "react";

/** The view rendered in the session canvas. */
export type SessionView = "chat" | "map" | "flow" | "atlas" | "diff";

/** Canonical ARIA ids — single source of truth shared with the panel. */
export const tabId = (view: SessionView) => `session-tab-${view}`;
export const panelId = (view: SessionView) => `session-panel-${view}`;

export const sessionViews: { id: SessionView; label: string }[] = [
	{ id: "chat", label: "Чат" },
	{ id: "map", label: "Карта" },
	{ id: "flow", label: "Поток" },
	{ id: "atlas", label: "Атлас" },
	{ id: "diff", label: "Изменения" },
];

type SessionTabsProps = {
	activeView: SessionView;
	onViewChange: (view: SessionView) => void;
};

export function SessionTabs({ activeView, onViewChange }: SessionTabsProps) {
	const tabRefs = useRef<
		Partial<Record<SessionView, HTMLButtonElement | null>>
	>({});

	const selectAndFocus = (view: SessionView) => {
		onViewChange(view);
		// The button node persists across the re-render (stable key), so focusing
		// it in the same tick moves focus with the roving tabindex.
		tabRefs.current[view]?.focus();
	};

	const handleKeyDown = (event: KeyboardEvent, index: number) => {
		const last = sessionViews.length - 1;
		let nextIndex: number;
		switch (event.key) {
			case "ArrowRight":
			case "ArrowDown":
				nextIndex = index === last ? 0 : index + 1;
				break;
			case "ArrowLeft":
			case "ArrowUp":
				nextIndex = index === 0 ? last : index - 1;
				break;
			case "Home":
				nextIndex = 0;
				break;
			case "End":
				nextIndex = last;
				break;
			default:
				return;
		}
		event.preventDefault();
		const next = sessionViews[nextIndex];
		if (next) {
			selectAndFocus(next.id);
		}
	};

	return (
		<div
			role="tablist"
			aria-label="Просмотр сессии"
			className="flex shrink-0 border-b border-border px-4"
		>
			{sessionViews.map((view, index) => {
				const isActive = activeView === view.id;
				return (
					<button
						key={view.id}
						ref={(el) => {
							tabRefs.current[view.id] = el;
						}}
						type="button"
						role="tab"
						id={tabId(view.id)}
						aria-selected={isActive}
						aria-controls={panelId(view.id)}
						tabIndex={isActive ? 0 : -1}
						onClick={() => onViewChange(view.id)}
						onKeyDown={(event) => handleKeyDown(event, index)}
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
