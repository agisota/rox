import { Avatar, AvatarFallback } from "@rox/ui/avatar";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@rox/ui/context-menu";
import { cn } from "@rox/ui/utils";
import { Archive, Bell, CheckCheck, Clock, Mail } from "lucide-react";
import type { InboxItem } from "../types";
import { formatRelativeTime } from "../utils/inboxTime";
import { GLASS_ACTIVE, GLASS_PILL } from "./glass";
import { SnoozePopover } from "./SnoozePopover";

export interface ThreadRowProps {
	item: InboxItem;
	active: boolean;
	onOpen: () => void;
	onArchive: () => void;
	onSnooze: (until: number) => void;
	onDone: () => void;
}

/**
 * One thread row in panel 2 (used inside the virtualizer). Source avatar/icon +
 * title + 1-line preview + relative time + unread badge/dot. Hover reveals quick
 * triage actions (archive / snooze / done), mirrored by a right-click context
 * menu so every action has both a mouse path and (via the list) a keyboard path.
 */
export function ThreadRow({
	item,
	active,
	onOpen,
	onArchive,
	onSnooze,
	onDone,
}: ThreadRowProps) {
	const unread = item.unreadCount > 0;
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					role="option"
					aria-selected={active}
					aria-label={
						unread
							? `${item.title}, ${item.unreadCount} непрочитанных`
							: item.title
					}
					tabIndex={-1}
					onClick={onOpen}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							onOpen();
						}
					}}
					className={cn(
						"group relative flex cursor-pointer items-start gap-2.5 border-white/5 border-b px-3 py-2.5 transition-colors",
						active ? GLASS_ACTIVE : "hover:bg-accent/40",
					)}
				>
					<SourceAvatar item={item} />

					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span
								className={cn(
									"flex-1 truncate text-sm",
									unread
										? "font-semibold text-foreground"
										: "text-foreground/90",
								)}
							>
								{item.title}
							</span>
							<time className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
								{formatRelativeTime(item.timestamp)}
							</time>
						</div>
						<div className="mt-0.5 flex items-center gap-2">
							<span className="flex-1 truncate text-muted-foreground text-xs">
								{item.preview}
							</span>
							{unread && (
								<span
									className={cn(
										GLASS_PILL,
										"shrink-0 rounded-full px-1.5 py-px font-mono text-[10px] text-foreground tabular-nums",
									)}
								>
									{item.unreadCount > 99 ? "99+" : item.unreadCount}
								</span>
							)}
						</div>
					</div>

					{/* Hover quick-actions (mouse dual of the j/k/e/s/# keys). */}
					<div className="absolute top-1.5 right-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
						<RowAction
							label="Архивировать"
							onClick={(e) => {
								e.stopPropagation();
								onArchive();
							}}
						>
							<Archive className="size-3.5" />
						</RowAction>
						<SnoozePopover onPick={onSnooze}>
							<button
								type="button"
								aria-label="Отложить"
								onClick={(e) => e.stopPropagation()}
								className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							>
								<Clock className="size-3.5" />
							</button>
						</SnoozePopover>
						<RowAction
							label="Готово"
							onClick={(e) => {
								e.stopPropagation();
								onDone();
							}}
						>
							<CheckCheck className="size-3.5" />
						</RowAction>
					</div>
				</div>
			</ContextMenuTrigger>

			<ContextMenuContent className="w-44">
				<ContextMenuItem onSelect={onArchive}>
					<Archive className="size-4" /> Архивировать
				</ContextMenuItem>
				<SnoozePopover onPick={onSnooze}>
					<ContextMenuItem onSelect={(e) => e.preventDefault()}>
						<Clock className="size-4" /> Отложить…
					</ContextMenuItem>
				</SnoozePopover>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onDone}>
					<CheckCheck className="size-4" /> Готово
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

function RowAction({
	label,
	onClick,
	children,
}: {
	label: string;
	onClick: (e: React.MouseEvent) => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			{children}
		</button>
	);
}

/** Source-typed avatar: chat initial, envelope for mail, bell for system. */
function SourceAvatar({ item }: { item: InboxItem }) {
	if (item.source === "chat") {
		const initial = item.title.trim().charAt(0).toUpperCase() || "?";
		return (
			<Avatar className="mt-0.5 size-7 shrink-0">
				<AvatarFallback className="bg-primary/15 font-mono text-[11px] text-primary">
					{initial}
				</AvatarFallback>
			</Avatar>
		);
	}
	const Icon = item.source === "mail" ? Mail : Bell;
	return (
		<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-muted-foreground">
			<Icon className="size-3.5" />
		</div>
	);
}
