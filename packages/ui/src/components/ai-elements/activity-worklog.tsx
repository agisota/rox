"use client";

import { ChevronRightIcon } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "../../lib/utils";
import { AnimatedHeight } from "../../motion/AnimatedHeight";
import { ToolCall } from "./tool-call";
import { ToolGroup, ToolGroupExpandAll, useToolGroupItem } from "./tool-group";

/**
 * F39 — Activity worklog timeline (verb-bucketed, persistent, expandable).
 *
 * Presentational generalization of {@link ExploringGroup}: renders a *persistent*
 * (never auto-collapsing) verb-bucketed timeline of tool activity. Each bucket is
 * one collapsible Activity row ("tense + count") whose detail rows expand on
 * click. A {@link ToolGroupExpandAll} toolbar (F40) toggles every row at once.
 *
 * Framework-agnostic and serializable-in/serializable-out: it consumes a plain
 * `ActivityWorklogGroup[]` model (produced by the shared `bucketActivityToolCalls`
 * selector in `@rox/chat/shared`) so web/desktop and the RN adapter share one
 * core. Collapse state is *controlled by the host* (`open` + `onOpenChange`) so it
 * can be persisted per-chat and survive re-render and chat switch.
 */

/** A single tool-call detail row inside an Activity bucket. */
export interface ActivityWorklogItem {
	icon: ComponentType<{ className?: string }>;
	title: string;
	subtitle?: string;
	isPending: boolean;
	isError: boolean;
	onClick?: () => void;
}

/** One verb-bucketed Activity row (mirrors `@rox/chat/shared` `ActivityGroup`). */
export interface ActivityWorklogGroup {
	id: string;
	/** "tense + count" summary, e.g. `Прочитано · 3 файла`. */
	summary: string;
	/** True while any call in the bucket is still running. */
	isPending: boolean;
	/** True when any call in the bucket errored. */
	isError: boolean;
	items: ActivityWorklogItem[];
}

export interface ActivityWorklogProps {
	groups: ActivityWorklogGroup[];
	/**
	 * Controlled overall collapse state (the header chevron). Host persists this
	 * per-chat so the timeline survives re-render and chat switch. Defaults to
	 * collapsed when omitted.
	 */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** Header label, e.g. "Activity". Routed through the host's i18n constant. */
	label?: string;
	className?: string;
}

export const ActivityWorklog = ({
	groups,
	open,
	onOpenChange,
	label = "Activity",
	className,
}: ActivityWorklogProps) => {
	if (groups.length === 0) return null;

	const isOpen = open ?? false;
	const toggle = () => onOpenChange?.(!isOpen);

	return (
		<ToolGroup className={className}>
			{/* Header — clickable to toggle the whole timeline + expand-all toolbar */}
			<div className="group flex items-center justify-between gap-2 py-0.5">
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: paired with the keyboard toggle button below */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: interactive group header */}
				<div
					className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-xs"
					onClick={toggle}
				>
					<span className="shrink-0 whitespace-nowrap font-medium text-muted-foreground">
						{label}
					</span>
					<span className="shrink-0 whitespace-nowrap text-muted-foreground/60">
						{groups.length}
					</span>
					<ChevronRightIcon
						className={cn(
							"h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200 ease-out",
							isOpen && "rotate-90",
							!isOpen && "opacity-0 group-hover:opacity-100",
						)}
					/>
				</div>
				{isOpen && <ToolGroupExpandAll />}
			</div>

			{/* Persistent timeline body — animates height, never auto-collapses */}
			<AnimatedHeight open={isOpen}>
				<div className="mt-1 space-y-1">
					{groups.map((group) => (
						<ActivityWorklogRow group={group} key={group.id} />
					))}
				</div>
			</AnimatedHeight>
		</ToolGroup>
	);
};

/**
 * One verb bucket: a collapsible summary row whose detail tool-calls expand on
 * click. Local open state is seeded collapsed; the surrounding {@link ToolGroup}
 * expand-all/collapse-all broadcast overrides it.
 */
function ActivityWorklogRow({ group }: { group: ActivityWorklogGroup }) {
	const { open, onOpenChange } = useToolGroupItem({ defaultOpen: false });

	return (
		<div>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: lightweight summary toggle */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: interactive bucket header */}
			<div
				className="group/row flex cursor-pointer items-center gap-1.5 py-0.5 text-xs"
				onClick={() => onOpenChange(!open)}
			>
				<ChevronRightIcon
					className={cn(
						"h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform duration-200 ease-out",
						open && "rotate-90",
					)}
				/>
				<span
					className={cn(
						"truncate",
						group.isError ? "text-destructive" : "text-muted-foreground",
					)}
				>
					{group.summary}
				</span>
			</div>

			<AnimatedHeight open={open}>
				<div className="ml-4 mt-0.5 space-y-1">
					{group.items.map((item, i) => (
						<ToolCall
							icon={item.icon}
							isError={item.isError}
							isPending={item.isPending}
							key={`${group.id}-${i}`}
							onClick={item.onClick}
							subtitle={item.subtitle}
							title={item.title}
						/>
					))}
				</div>
			</AnimatedHeight>
		</div>
	);
}
