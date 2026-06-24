import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { cn } from "@rox/ui/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
	Archive,
	CheckCheck,
	Clock,
	ExternalLink,
	Inbox,
	MoreVertical,
	X,
} from "lucide-react";
import type { RefObject } from "react";
import type { InboxItem } from "../types";
import { ChatThreadReader } from "./ChatThreadReader";
import { GLASS_PANEL } from "./glass";
import { MailThreadReader } from "./MailThreadReader";
import { SnoozePopover } from "./SnoozePopover";
import { SystemEventCard } from "./SystemEventCard";

export interface ReaderPanelProps {
	item: InboxItem | null;
	composerRef: RefObject<HTMLTextAreaElement | null>;
	onClose: () => void;
	onArchive: (item: InboxItem) => void;
	onSnooze: (item: InboxItem, until: number) => void;
	onDone: (item: InboxItem) => void;
}

/**
 * Panel 3 — the reader. Routes the selected row to the transport-specific
 * reader (chat bubbles+composer / mail body / system event card) under a shared
 * inbox header (title + kebab with Архивировать/Отложить/Готово/Открыть
 * источник + Esc-close). Switching the active thread crossfades the body
 * (≤200 ms, opacity-only under reduced motion).
 */
export function ReaderPanel({
	item,
	composerRef,
	onClose,
	onArchive,
	onSnooze,
	onDone,
}: ReaderPanelProps) {
	const reduceMotion = useReducedMotion();

	if (!item) {
		return (
			<div
				className={cn(
					GLASS_PANEL,
					"flex h-full flex-col items-center justify-center gap-2 text-center",
				)}
			>
				<Inbox className="size-8 text-muted-foreground" />
				<span className="text-muted-foreground text-sm">
					Выберите элемент слева
				</span>
			</div>
		);
	}

	return (
		<div className={cn(GLASS_PANEL, "flex h-full min-h-0 flex-col")}>
			<header className="flex shrink-0 items-center gap-2 border-white/5 border-b px-4 py-2.5">
				<h2 className="min-w-0 flex-1 truncate font-semibold text-sm">
					{item.title}
				</h2>

				<SnoozePopover onPick={(until) => onSnooze(item, until)}>
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="size-7"
						aria-label="Отложить"
					>
						<Clock className="size-4" />
					</Button>
				</SnoozePopover>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							className="size-7"
							aria-label="Действия"
						>
							<MoreVertical className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						<DropdownMenuItem onSelect={() => onArchive(item)}>
							<Archive className="size-4" /> Архивировать
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onDone(item)}>
							<CheckCheck className="size-4" /> Готово
						</DropdownMenuItem>
						{item.source === "system" && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem onSelect={onClose}>
									<ExternalLink className="size-4" /> Открыть источник
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>

				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="size-7"
					aria-label="Закрыть"
					onClick={onClose}
				>
					<X className="size-4" />
				</Button>
			</header>

			<div className="min-h-0 flex-1">
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={item.key}
						initial={reduceMotion ? false : { opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
						transition={{ duration: 0.12 }}
						className="h-full min-h-0"
					>
						{item.source === "chat" ? (
							<ChatThreadReader
								threadId={item.threadId}
								composerRef={composerRef}
							/>
						) : item.source === "mail" ? (
							<MailThreadReader threadId={item.threadId} />
						) : (
							<SystemEventCard item={item} />
						)}
					</motion.div>
				</AnimatePresence>
			</div>
		</div>
	);
}
