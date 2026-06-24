import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { ScrollArea } from "@rox/ui/scroll-area";
import { Skeleton } from "@rox/ui/skeleton";
import { cn } from "@rox/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useMemo } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";
// Reuse the proven mail body pipeline from the EmailView surface (read-only
// import — we never edit that folder). Keeps R2 fetch + DOMPurify identical.
import { sanitizeMailHtml } from "../../EmailView/sanitizeMailHtml";
import { useMailBody } from "../../EmailView/useMailBody";
import { formatRelativeTime } from "../utils/inboxTime";

export interface MailThreadReaderProps {
	threadId: string;
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
export function MailThreadReader({ threadId }: MailThreadReaderProps) {
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

	return (
		<ScrollArea className="h-full min-h-0">
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
							message.receivedAt ?? message.sentAt ?? message.createdAt ?? null;
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
