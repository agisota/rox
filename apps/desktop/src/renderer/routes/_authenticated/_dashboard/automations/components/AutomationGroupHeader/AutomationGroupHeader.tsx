import { cn } from "@rox/ui/utils";
import type { ReactNode } from "react";
import { HiChevronRight } from "react-icons/hi2";

interface AutomationGroupHeaderProps {
	/** Group title (project name, or a fallback label). */
	label: string;
	/** Number of automations in this group. */
	count: number;
	/** Whether the group is folded. */
	isCollapsed: boolean;
	/** Toggle the group's folded state. */
	onToggle: () => void;
	/** Optional leading visual (e.g. a project thumbnail). */
	icon?: ReactNode;
}

/**
 * Collapsible header for a group of automations in the list. Acts as a single
 * toggle target: clicking anywhere (or Enter/Space) folds/unfolds the group.
 *
 * Dark glass, Victor Mono count, RU — matches the Automations surface.
 */
export function AutomationGroupHeader({
	label,
	count,
	isCollapsed,
	onToggle,
	icon,
}: AutomationGroupHeaderProps) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: sticky grid header needs nested content + custom layout; a <button> can't be a grid/sticky row here.
		<div
			role="button"
			tabIndex={0}
			aria-expanded={!isCollapsed}
			onClick={onToggle}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onToggle();
				}
			}}
			className={cn(
				"group/group sticky top-8 z-[5] flex h-9 w-full cursor-pointer items-center gap-2 px-4",
				"border-b border-border/60 bg-card/70 backdrop-blur-md",
				"text-[13px] font-medium text-foreground/90 outline-none transition-colors",
				"hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
			)}
		>
			<HiChevronRight
				className={cn(
					"size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
					!isCollapsed && "rotate-90",
				)}
			/>
			{icon ? <span className="flex shrink-0 items-center">{icon}</span> : null}
			<span className="min-w-0 truncate" title={label}>
				{label}
			</span>
			<span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/70">
				{count}
			</span>
		</div>
	);
}
