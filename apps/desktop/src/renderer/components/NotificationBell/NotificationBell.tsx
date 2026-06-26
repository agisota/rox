import { Pressable } from "@rox/ui/motion";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { cn } from "@rox/ui/utils";
import { useCallback, useState } from "react";
import { LuBell } from "react-icons/lu";
import {
	useNotificationFeedStore,
	useNotificationUnreadCount,
} from "renderer/stores/notification-feed";
import { NotificationPanel } from "./NotificationPanel";

/** Glass panel token — matches the inbox surface language. */
const GLASS_PANEL =
	"bg-card/60 backdrop-blur-md border border-white/5 rounded-xl";

/**
 * Global top-bar notification bell. Lives in the right-hand TopBar action
 * cluster (near search / org switcher) and is therefore visible on every
 * dashboard surface (mail, journal, chat, tasks, inbox, workspaces).
 *
 * The unread count comes from the {@link useNotificationFeedStore} feed; opening
 * the panel marks everything read (the badge clears on open, per the spec).
 * Clicking an entry inside the panel navigates to its source and closes.
 */
export function NotificationBell() {
	const [open, setOpen] = useState(false);
	const unread = useNotificationUnreadCount();
	const markAllRead = useNotificationFeedStore((s) => s.markAllRead);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			setOpen(next);
			// Clear the badge the moment the panel opens (read-on-open).
			if (next) markAllRead();
		},
		[markAllRead],
	);

	const hasUnread = unread > 0;
	const badgeLabel = unread > 99 ? "99+" : String(unread);

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Pressable
					type="button"
					aria-label={
						hasUnread ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"
					}
					className={cn(
						"no-drag relative flex size-7 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
						open && "bg-muted text-foreground",
					)}
				>
					<LuBell className="size-3.5" />
					{hasUnread && (
						<span
							className={cn(
								"absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[9px] font-semibold leading-none text-primary-foreground tabular-nums shadow-sm",
								unread > 99 && "px-0.5",
							)}
						>
							{badgeLabel}
						</span>
					)}
				</Pressable>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				className={cn(GLASS_PANEL, "w-80 overflow-hidden p-0")}
			>
				<NotificationPanel onClose={() => setOpen(false)} />
			</PopoverContent>
		</Popover>
	);
}
