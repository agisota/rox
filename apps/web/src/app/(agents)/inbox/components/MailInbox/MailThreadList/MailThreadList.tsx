"use client";

import { ScrollArea } from "@rox/ui/scroll-area";
import { Skeleton } from "@rox/ui/skeleton";
import { Mail } from "lucide-react";

import { useMailThreadList } from "../../../hooks/useMailThreadList";
import { MailAddressBadge } from "../MailAddressBadge";
import { MailThreadListItem } from "./MailThreadListItem";

export interface MailThreadListProps {
	activeThreadId: string | null;
	onSelect: (threadId: string) => void;
	/** Open the standalone composer (new email, not a reply). */
	onCompose: () => void;
}

/**
 * The left pane of the mail surface: the `<handle>@rox.one` thread list plus the
 * address affordance + a "new email" entry point.
 *
 * Cache-first (AGENTS.md #9): persisted threads render the moment they exist; the
 * skeleton only shows on the empty first load, and the empty state only once the
 * query has resolved with zero threads.
 */
export function MailThreadList({
	activeThreadId,
	onSelect,
	onCompose,
}: MailThreadListProps) {
	const { threads, isInitialLoading, isError } = useMailThreadList();

	return (
		<div className="flex h-full flex-col">
			<div className="flex flex-col gap-2 border-b px-3 py-3">
				<div className="flex items-center justify-between gap-2">
					<h2 className="flex items-center gap-2 text-sm font-semibold">
						<Mail className="size-4 text-primary" /> Почта
					</h2>
					<button
						type="button"
						onClick={onCompose}
						className="text-xs font-medium text-primary hover:underline"
					>
						Новое письмо
					</button>
				</div>
				<MailAddressBadge />
			</div>

			<ScrollArea className="flex-1">
				{isInitialLoading ? (
					<div className="flex flex-col gap-2 p-3">
						{["a", "b", "c", "d"].map((k) => (
							<Skeleton key={k} className="h-12 w-full rounded-md" />
						))}
					</div>
				) : threads.length === 0 ? (
					<div className="flex flex-col items-center gap-2 p-8 text-center">
						<Mail className="size-7 text-muted-foreground" />
						<p className="text-xs text-muted-foreground">
							{isError ? "Не удалось загрузить почту." : "Писем пока нет."}
						</p>
					</div>
				) : (
					threads.map((thread) => (
						<MailThreadListItem
							key={thread.id}
							id={thread.id}
							subject={thread.subjectNorm}
							lastMessageAt={thread.lastMessageAt}
							messageCount={thread.messageCount}
							isActive={thread.id === activeThreadId}
							onSelect={onSelect}
						/>
					))
				)}
			</ScrollArea>
		</div>
	);
}
