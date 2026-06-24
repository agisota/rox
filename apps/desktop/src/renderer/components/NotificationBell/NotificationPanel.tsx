import { ScrollArea } from "@rox/ui/scroll-area";
import { cn } from "@rox/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuBellOff, LuCheckCheck } from "react-icons/lu";
import { formatRelativeTime } from "renderer/screens/suite/InboxView/utils/inboxTime";
import {
	type NotificationEntry,
	type NotificationTarget,
	useNotificationFeedStore,
} from "renderer/stores/notification-feed";
import { KIND_VISUAL } from "./lib/kindVisuals";

/** Glass tokens — reuse the inbox surface language so the panel matches. */
const GLASS_PILL = "bg-white/5";

export interface NotificationPanelProps {
	/** Close the popover after a click-through. */
	onClose: () => void;
}

/**
 * The bell dropdown body: a newest-first list of recent in-app notifications,
 * each with a kind icon, RU title/preview, and relative RU time. Clicking a row
 * marks it read and navigates to its source surface (mail / inbox / tasks /
 * workspace / automations). The empty state is honest — when nothing has
 * arrived the panel says so rather than inventing rows.
 */
export function NotificationPanel({ onClose }: NotificationPanelProps) {
	const navigate = useNavigate();
	const entries = useNotificationFeedStore((s) => s.entries);
	const markRead = useNotificationFeedStore((s) => s.markRead);
	const clear = useNotificationFeedStore((s) => s.clear);

	const handleOpen = (entry: NotificationEntry) => {
		markRead(entry.id);
		void navigateToTarget(entry.target);
		onClose();
	};

	const navigateToTarget = (target: NotificationTarget): Promise<void> => {
		if (target.to === "/v2-workspace/$workspaceId") {
			return navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: target.workspaceId },
			});
		}
		return navigate({ to: target.to });
	};

	return (
		<div className="flex max-h-[28rem] w-80 flex-col">
			<header className="flex items-center justify-between px-3 py-2.5">
				<span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
					Уведомления
				</span>
				{entries.length > 0 && (
					<button
						type="button"
						onClick={clear}
						className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<LuCheckCheck className="size-3" />
						Очистить
					</button>
				)}
			</header>

			{entries.length === 0 ? (
				<div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
					<LuBellOff className="size-6 text-muted-foreground/60" />
					<p className="text-sm text-muted-foreground">Пока нет уведомлений</p>
					<p className="font-mono text-[10px] text-muted-foreground/70">
						Новая почта, упоминания и завершённые агенты появятся здесь
					</p>
				</div>
			) : (
				<ScrollArea className="min-h-0 flex-1">
					<ul className="flex flex-col gap-0.5 px-1.5 pb-1.5">
						{entries.map((entry) => {
							const { Icon, tint } = KIND_VISUAL[entry.kind];
							return (
								<li key={entry.id}>
									<button
										type="button"
										onClick={() => handleOpen(entry)}
										className={cn(
											"flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/80",
											!entry.read && "bg-white/[0.03]",
										)}
									>
										<span
											className={cn(
												"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
												GLASS_PILL,
												tint,
											)}
										>
											<Icon className="size-3.5" />
										</span>
										<span className="flex min-w-0 flex-1 flex-col gap-0.5">
											<span className="flex items-center gap-2">
												<span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
													{entry.title}
												</span>
												{!entry.read && (
													<span className="size-1.5 shrink-0 rounded-full bg-primary" />
												)}
											</span>
											<span className="truncate text-xs text-muted-foreground">
												{entry.body}
											</span>
											<span className="font-mono text-[10px] text-muted-foreground/70">
												{formatRelativeTime(new Date(entry.at))}
											</span>
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				</ScrollArea>
			)}
		</div>
	);
}
