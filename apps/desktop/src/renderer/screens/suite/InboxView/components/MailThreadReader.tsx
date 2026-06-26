import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { ScrollArea } from "@rox/ui/scroll-area";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { cn } from "@rox/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Send } from "lucide-react";
import { type RefObject, useEffect, useMemo, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";
// Reuse the proven mail body pipeline from the EmailView surface (read-only
// import — we never edit that folder). Keeps R2 fetch + DOMPurify identical.
import { sanitizeMailHtml } from "../../EmailView/sanitizeMailHtml";
import { useMailBody } from "../../EmailView/useMailBody";
import {
	buildReplyContext,
	type ReplyContext,
} from "../utils/buildReplyContext";
import { formatRelativeTime } from "../utils/inboxTime";

export interface MailThreadReaderProps {
	threadId: string;
	/** Ref so the keyboard layer can focus the reply composer on `r`. */
	composerRef?: RefObject<HTMLTextAreaElement | null>;
}

/**
 * Reader for a mail thread inside the unified inbox. Reuses the EmailView R2
 * body pipeline (`useMailBody` + `sanitizeMailHtml`) so HTML bodies stay
 * sanitized and rendered identically, but presents them under the inbox's own
 * header (no nested SuiteScreen → fixes the double-header gap the spec calls
 * out). Opening an unread inbound message marks it read optimistically.
 *
 * Cache-first (AGENTS.md #9): `mail.markRead` invalidates `getThread` so the
 * read state lands from the authoritative refetch.
 */
export function MailThreadReader({
	threadId,
	composerRef,
}: MailThreadReaderProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const threadQuery = useQuery(trpc.mail.getThread.queryOptions({ threadId }));
	const messages = threadQuery.data?.messages ?? [];

	const markRead = useMutation(
		trpc.mail.markRead.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.mail.getThread.queryKey({ threadId }),
				});
			},
			onError: (error) =>
				logger.error("[InboxView] mail markRead failed", error),
		}),
	);

	// The mailbox owner's own address: the `fromAddr` of any of our outbound
	// messages, else null. Used to exclude self from the reply recipients.
	const ownAddress = useMemo(
		() => messages.find((m) => m.direction === "outbound")?.fromAddr ?? null,
		[messages],
	);

	const reply = useMemo(
		() => buildReplyContext(messages, ownAddress),
		[messages, ownAddress],
	);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-3 p-4">
					{threadQuery.isError ? (
						<p className="cursor-text select-text text-destructive text-sm">
							{threadQuery.error.message}
						</p>
					) : threadQuery.isLoading && messages.length === 0 ? (
						<div className="space-y-3">
							<Skeleton className="h-6 w-1/2" />
							<Skeleton className="h-20 w-full" />
						</div>
					) : (
						messages.map((message) => {
							const isOutbound = message.direction === "outbound";
							const timestamp =
								message.receivedAt ??
								message.sentAt ??
								message.createdAt ??
								null;
							const unread = !message.isRead && !isOutbound;
							return (
								<article
									key={message.id}
									className="rounded-lg border border-white/5 bg-card/40"
								>
									<header className="flex items-start justify-between gap-2 border-white/5 border-b px-3 py-2">
										<div className="flex min-w-0 flex-col">
											<span className="flex items-center gap-2">
												<span className="truncate font-medium text-sm">
													{isOutbound
														? "Вы"
														: (message.fromName ?? message.fromAddr)}
												</span>
												<Badge
													variant="outline"
													className="shrink-0 gap-1 px-1.5 py-0 text-[10px]"
												>
													{isOutbound ? (
														<ArrowUpRight className="size-2.5" />
													) : (
														<ArrowDownLeft className="size-2.5" />
													)}
													{isOutbound ? "Исходящее" : "Входящее"}
												</Badge>
												{unread && (
													<span className="size-1.5 shrink-0 rounded-full bg-primary" />
												)}
											</span>
											<span className="truncate text-[11px] text-muted-foreground">
												{message.subject?.trim() || "(без темы)"}
											</span>
										</div>
										<div className="flex shrink-0 items-center gap-2">
											<span className="font-mono text-[10px] text-muted-foreground tabular-nums">
												{formatRelativeTime(timestamp)}
											</span>
											{unread && (
												<Button
													size="sm"
													variant="ghost"
													className="h-6 px-2 text-[10px]"
													disabled={markRead.isPending}
													onClick={() =>
														markRead.mutate({
															messageId: message.id,
															isRead: true,
														})
													}
												>
													Прочитано
												</Button>
											)}
										</div>
									</header>
									<MailMessageBody
										messageId={message.id}
										snippet={message.snippet ?? null}
									/>
								</article>
							);
						})
					)}
				</div>
			</ScrollArea>

			<MailReplyComposer
				threadId={threadId}
				reply={reply}
				composerRef={composerRef}
				onSent={async () => {
					await Promise.all([
						queryClient.invalidateQueries({
							queryKey: trpc.mail.getThread.queryKey({ threadId }),
						}),
						queryClient.invalidateQueries({
							queryKey: trpc.mail.listThreads.queryKey({ limit: 50 }),
						}),
					]);
				}}
			/>
		</div>
	);
}

/**
 * Reply composer pinned to the bottom of a mail thread. Sends through
 * `mail.send` with the thread's reply context (`threadId` + `inReplyTo` +
 * `references` so the message lands in the SAME thread), then invalidates the
 * thread + list caches (cache-first, AGENTS.md #9). The `r` hotkey focuses the
 * textarea via `composerRef`. Disabled when no recipient can be resolved
 * (e.g. an empty/own-only thread).
 */
function MailReplyComposer({
	threadId,
	reply,
	composerRef,
	onSent,
}: {
	threadId: string;
	reply: ReplyContext | null;
	composerRef?: RefObject<HTMLTextAreaElement | null>;
	onSent: () => void | Promise<void>;
}) {
	const trpc = useTRPC();
	const [body, setBody] = useState("");

	// Reset the draft when switching threads.
	// biome-ignore lint/correctness/useExhaustiveDependencies: clear on thread switch only.
	useEffect(() => {
		setBody("");
	}, [threadId]);

	const send = useMutation(
		trpc.mail.send.mutationOptions({
			onSuccess: async () => {
				setBody("");
				await onSent();
				toast.success("Ответ отправлен");
			},
			onError: (error) => {
				logger.error("[InboxView] mail reply send failed", error);
				toast.error(error.message || "Не удалось отправить ответ");
			},
		}),
	);

	const canSend = reply !== null && body.trim().length > 0 && !send.isPending;

	const handleSend = () => {
		if (!reply || body.trim().length === 0 || send.isPending) return;
		send.mutate({
			threadId,
			to: reply.to,
			cc: reply.cc.length > 0 ? reply.cc : undefined,
			subject: reply.subject,
			body,
			inReplyTo: reply.inReplyTo,
			references: reply.references.length > 0 ? reply.references : undefined,
		});
	};

	return (
		<div className="shrink-0 border-white/5 border-t p-3">
			<div className="flex items-end gap-2">
				<Textarea
					ref={composerRef}
					value={body}
					onChange={(e) => setBody(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
							e.preventDefault();
							handleSend();
						}
					}}
					placeholder={
						reply === null
							? "Некому ответить в этом письме"
							: "Ответить… (⌘↵ для отправки)"
					}
					rows={2}
					disabled={reply === null}
					className="max-h-40 min-h-9 flex-1 resize-none"
				/>
				<Button
					type="button"
					size="icon"
					className="size-9 shrink-0"
					aria-label="Отправить ответ"
					disabled={!canSend}
					onClick={handleSend}
				>
					<Send className="size-4" />
				</Button>
			</div>
		</div>
	);
}

/**
 * One mail message body: full content from R2 (`useMailBody`). HTML is
 * DOMPurify-sanitized (`sanitizeMailHtml`) and injected into an isolated clipped
 * container; text renders escaped. The snippet is the loading/error fallback.
 */
function MailMessageBody({
	messageId,
	snippet,
}: {
	messageId: string;
	snippet: string | null;
}) {
	const bodyQuery = useMailBody(messageId, true);
	const sanitizedHtml = useMemo(() => {
		if (bodyQuery.data?.kind !== "html") return null;
		return sanitizeMailHtml(bodyQuery.data.content);
	}, [bodyQuery.data]);

	return (
		<div className="px-3 py-3">
			{bodyQuery.isLoading ? (
				<p className="cursor-text select-text whitespace-pre-wrap break-words text-muted-foreground text-sm">
					Загрузка письма…
				</p>
			) : sanitizedHtml !== null ? (
				<div
					className={cn(
						"mail-html-body max-h-[60vh] cursor-text select-text overflow-auto break-words text-sm",
						"[&_a]:underline [&_img]:max-w-full",
					)}
					// Sanitized via DOMPurify in sanitizeMailHtml; rendered in an isolated,
					// clipped container so even valid markup stays bounded.
					// biome-ignore lint/security/noDangerouslySetInnerHtml: content is DOMPurify-sanitized
					dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
				/>
			) : (
				<p className="cursor-text select-text whitespace-pre-wrap break-words text-sm">
					{bodyQuery.data?.content?.trim() ||
						snippet?.trim() ||
						"Текст письма недоступен в предпросмотре."}
				</p>
			)}
		</div>
	);
}
