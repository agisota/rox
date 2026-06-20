"use client";

import { ScrollArea } from "@rox/ui/scroll-area";
import { Skeleton } from "@rox/ui/skeleton";
import { Inbox } from "lucide-react";

import { useThreadList } from "../../hooks/useThreadList";
import { ThreadListItem } from "./ThreadListItem";

export interface ThreadListProps {
	/** Currently selected thread id (highlighted). */
	activeThreadId: string | null;
	onSelect: (threadId: string) => void;
}

/**
 * The left pane: the unified inbox thread list.
 *
 * Cache-first (AGENTS.md #9): persisted threads render the moment they exist; the
 * skeleton only shows on the empty first load, and the empty state only when the
 * query has resolved with zero threads.
 */
export function ThreadList({ activeThreadId, onSelect }: ThreadListProps) {
	const { threads, isInitialLoading, isError } = useThreadList();

	return (
		<div className="flex h-full flex-col">
			<div className="border-b px-3 py-3">
				<h2 className="flex items-center gap-2 text-sm font-semibold">
					<Inbox className="size-4 text-primary" /> Входящие
				</h2>
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
						<Inbox className="size-7 text-muted-foreground" />
						<p className="text-xs text-muted-foreground">
							{isError
								? "Не удалось загрузить входящие."
								: "Пока нет переписок."}
						</p>
					</div>
				) : (
					threads.map((thread) => (
						<ThreadListItem
							key={thread.id}
							id={thread.id}
							subject={thread.subject}
							lastMessageAt={thread.lastMessageAt}
							isActive={thread.id === activeThreadId}
							onSelect={onSelect}
						/>
					))
				)}
			</ScrollArea>
		</div>
	);
}
