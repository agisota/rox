import { AnimatedNumber } from "@rox/ui/motion";
import { Separator } from "@rox/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@rox/ui/toggle-group";
import { cn } from "@rox/ui/utils";
import {
	Archive,
	Bell,
	Clock,
	Inbox,
	Mail,
	MessagesSquare,
} from "lucide-react";
import type { ComponentType } from "react";
import type { InboxFilter, InboxStatusFilter } from "../types";
import { GLASS_PANEL, GLASS_PILL } from "./glass";

interface RailEntry {
	id: InboxFilter;
	label: string;
	icon: ComponentType<{ className?: string }>;
}

const PRIMARY: readonly RailEntry[] = [
	{ id: "all", label: "Все", icon: Inbox },
	{ id: "chat", label: "Чат", icon: MessagesSquare },
	{ id: "mail", label: "Почта", icon: Mail },
	{ id: "system", label: "Система", icon: Bell },
];

/** Per-entry unread badge: "Все" shows chat unread, "Система" shows system unread. */
function badgeFor(
	id: InboxFilter,
	totalUnread: number,
	systemUnread: number,
): number {
	if (id === "all") return totalUnread;
	if (id === "system") return systemUnread;
	return 0;
}

const SECONDARY: readonly RailEntry[] = [
	{ id: "snoozed", label: "Сохранённое", icon: Clock },
	{ id: "archive", label: "Архив", icon: Archive },
];

export interface FilterRailProps {
	filter: InboxFilter;
	onFilterChange: (filter: InboxFilter) => void;
	status: InboxStatusFilter;
	onStatusChange: (status: InboxStatusFilter) => void;
	/** Total unread, shown as a glass pill on "Все". */
	totalUnread: number;
	/** Unread system events, shown as a glass pill on "Система". */
	systemUnread: number;
}

/**
 * Panel 1 — the filter rail. Switches the active slice (Все/Чат/Почта/Система/
 * Сохранённое/Архив) and carries the Непрочитанные/Все status toggle at the
 * bottom (Radix `ToggleGroup`). The "Все" entry shows a live unread pill that
 * springs on increment (`AnimatedNumber`).
 */
export function FilterRail({
	filter,
	onFilterChange,
	status,
	onStatusChange,
	totalUnread,
	systemUnread,
}: FilterRailProps) {
	return (
		<nav
			aria-label="Фильтры входящих"
			className={cn(GLASS_PANEL, "flex flex-col gap-1 p-2")}
		>
			{PRIMARY.map((entry) => (
				<RailButton
					key={entry.id}
					entry={entry}
					active={filter === entry.id}
					badge={badgeFor(entry.id, totalUnread, systemUnread)}
					onClick={() => onFilterChange(entry.id)}
				/>
			))}

			<Separator className="my-1.5 bg-white/5" />

			{SECONDARY.map((entry) => (
				<RailButton
					key={entry.id}
					entry={entry}
					active={filter === entry.id}
					badge={0}
					onClick={() => onFilterChange(entry.id)}
				/>
			))}

			<div className="mt-auto px-1 pt-3">
				<ToggleGroup
					type="single"
					value={status}
					onValueChange={(next) => {
						if (next) onStatusChange(next as InboxStatusFilter);
					}}
					className="grid w-full grid-cols-2 gap-1"
				>
					<ToggleGroupItem value="unread" className="text-[11px]">
						Непроч.
					</ToggleGroupItem>
					<ToggleGroupItem value="all" className="text-[11px]">
						Все
					</ToggleGroupItem>
				</ToggleGroup>
			</div>
		</nav>
	);
}

function RailButton({
	entry,
	active,
	badge,
	onClick,
}: {
	entry: RailEntry;
	active: boolean;
	badge: number;
	onClick: () => void;
}) {
	const Icon = entry.icon;
	return (
		<button
			type="button"
			onClick={onClick}
			aria-current={active ? "page" : undefined}
			className={cn(
				"flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
				active
					? "bg-accent text-accent-foreground"
					: "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
			)}
		>
			<Icon className="size-4 shrink-0" />
			<span className="flex-1 truncate">{entry.label}</span>
			{badge > 0 && (
				<AnimatedNumber
					value={badge}
					format={(v) => {
						const n = Math.round(v);
						return n > 99 ? "99+" : String(n);
					}}
					className={cn(
						GLASS_PILL,
						"min-w-5 rounded-full px-1.5 py-px text-center font-mono text-[10px] text-foreground tabular-nums",
					)}
				/>
			)}
		</button>
	);
}
