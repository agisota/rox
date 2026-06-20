"use client";

import { authClient } from "@rox/auth/client";
import { ScrollArea } from "@rox/ui/scroll-area";
import { Skeleton } from "@rox/ui/skeleton";
import { MessagesSquare } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { useThread } from "../../hooks/useThread";
import { formatThreadTitle } from "../../utils/formatThreadTitle";
import { Composer } from "../Composer";
import { MessageBubble } from "../MessageBubble";
import { ThreadPresence } from "../ThreadPresence";

export interface ThreadViewProps {
	/** The selected thread id, or null when nothing is selected. */
	threadId: string | null;
}

/**
 * The right pane: a selected thread's messages + composer, with live presence in
 * the header. Cache-first (AGENTS.md #9): persisted messages render immediately;
 * the skeleton only shows on the empty first load of a freshly selected thread.
 */
export function ThreadView({ threadId }: ThreadViewProps) {
	const session = authClient.useSession();
	const currentUserId = session.data?.user?.id;

	const { thread, messages, participants, isInitialLoading, isError } =
		useThread(threadId);

	// Typing broadcaster wired from ThreadPresence → Composer.
	const setTypingRef = useRef<(typing: boolean) => void>(() => {});
	const handleTypingControl = useCallback(
		(setter: (typing: boolean) => void) => {
			setTypingRef.current = setter;
		},
		[],
	);
	const handleTypingChange = useCallback((typing: boolean) => {
		setTypingRef.current(typing);
	}, []);

	// Auto-scroll to the newest message when the thread or message count changes.
	const bottomRef = useRef<HTMLDivElement>(null);
	const messageCount = messages.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll must re-run when a new message arrives or the thread switches, even though the body only touches a ref.
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ block: "end" });
	}, [messageCount, threadId]);

	if (!threadId) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-center">
				<MessagesSquare className="size-8 text-muted-foreground" />
				<p className="text-sm text-muted-foreground">
					Выберите переписку слева, чтобы открыть её.
				</p>
			</div>
		);
	}

	// Author display-name map: rox users only (P0 in-app). Falls back gracefully.
	const nameByUserId = new Map<string, string>();
	for (const p of participants) {
		if (p.userId)
			nameByUserId.set(p.userId, `Участник ${p.userId.slice(0, 6)}`);
	}

	const recipientUserIds = participants
		.map((p) => p.userId)
		.filter((id): id is string => Boolean(id) && id !== currentUserId);

	return (
		<div className="flex h-full flex-col">
			<header className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
				<h2 className="truncate text-sm font-semibold">
					{thread
						? formatThreadTitle({ subject: thread.subject, id: thread.id })
						: "Переписка"}
				</h2>
				<ThreadPresence
					threadId={threadId}
					onTypingControl={handleTypingControl}
				/>
			</header>

			<ScrollArea className="flex-1">
				<div className="flex flex-col gap-3 p-4">
					{isInitialLoading ? (
						["a", "b", "c"].map((k) => (
							<Skeleton key={k} className="h-12 w-2/3 rounded-2xl" />
						))
					) : messages.length === 0 ? (
						<p className="py-8 text-center text-xs text-muted-foreground">
							{isError
								? "Не удалось загрузить сообщения."
								: "Сообщений пока нет — напишите первое."}
						</p>
					) : (
						messages.map((message) => (
							<MessageBubble
								key={message.id}
								currentUserId={currentUserId}
								authorName={
									message.authorUserId
										? (nameByUserId.get(message.authorUserId) ?? "Участник")
										: "Внешний контакт"
								}
								message={{
									id: message.id,
									body: message.body,
									authorUserId: message.authorUserId,
									createdAt: message.createdAt,
									attachments: message.attachments,
								}}
							/>
						))
					)}
					<div ref={bottomRef} />
				</div>
			</ScrollArea>

			<Composer
				threadId={threadId}
				recipientUserIds={recipientUserIds}
				onTypingChange={handleTypingChange}
			/>
		</div>
	);
}
