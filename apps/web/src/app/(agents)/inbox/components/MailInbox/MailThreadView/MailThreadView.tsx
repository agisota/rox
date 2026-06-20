"use client";

import { Button } from "@rox/ui/button";
import { ScrollArea } from "@rox/ui/scroll-area";
import { Skeleton } from "@rox/ui/skeleton";
import { Mail, Reply } from "lucide-react";
import { useMemo, useState } from "react";

import { useMailThread } from "../../../hooks/useMailThread";
import { buildMailReplyContext } from "../../../utils/mailReplyContext";
import { MailComposer } from "../MailComposer";
import { MailMessageCard } from "../MailMessageCard";

export interface MailThreadViewProps {
	threadId: string | null;
}

/**
 * The right pane of the mail surface: a selected thread's messages with a reply
 * composer. Cache-first (AGENTS.md #9): persisted messages render immediately;
 * the skeleton only shows on the empty first load of a freshly selected thread.
 *
 * Opening a thread marks its unread messages read (via `useMailThread`). The most
 * recent message is expanded by default; tapping any card toggles its detail +
 * attachment load. "Ответить" derives RFC reply headers from the thread context.
 */
export function MailThreadView({ threadId }: MailThreadViewProps) {
	const { thread, messages, isInitialLoading, isError } =
		useMailThread(threadId);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [replyOpen, setReplyOpen] = useState(false);

	const replyContext = useMemo(
		() => buildMailReplyContext(thread, messages),
		[thread, messages],
	);

	const latestId = messages.at(-1)?.id ?? null;

	if (!threadId) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-center">
				<Mail className="size-8 text-muted-foreground" />
				<p className="text-sm text-muted-foreground">
					Выберите письмо слева, чтобы открыть его.
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<header className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
				<h2 className="truncate text-sm font-semibold">
					{thread?.subjectNorm?.trim() || "Письмо"}
				</h2>
				{messages.length > 0 && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-7 gap-1.5 text-xs"
						onClick={() => setReplyOpen((v) => !v)}
					>
						<Reply className="size-3.5" /> Ответить
					</Button>
				)}
			</header>

			<ScrollArea className="flex-1">
				<div className="flex flex-col gap-2 p-4">
					{isInitialLoading ? (
						["a", "b", "c"].map((k) => (
							<Skeleton key={k} className="h-16 w-full rounded-lg" />
						))
					) : messages.length === 0 ? (
						<p className="py-8 text-center text-xs text-muted-foreground">
							{isError
								? "Не удалось загрузить письмо."
								: "В этой переписке пока нет сообщений."}
						</p>
					) : (
						messages.map((message) => (
							<MailMessageCard
								key={message.id}
								message={message}
								expanded={
									expandedId
										? expandedId === message.id
										: message.id === latestId
								}
								onToggle={(id) =>
									setExpandedId((cur) => (cur === id ? null : id))
								}
							/>
						))
					)}
				</div>
			</ScrollArea>

			{replyOpen && threadId && (
				<MailComposer
					reply={{ threadId, context: replyContext }}
					onSent={() => setReplyOpen(false)}
					onCancel={() => setReplyOpen(false)}
				/>
			)}
		</div>
	);
}
