import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";
import type { InboxItem } from "../types";

/**
 * Per-thread "mark unread / read" toggle backing the inbox `u` hotkey.
 *
 * `u` is a read-STATE action on the ACTIVE thread — NOT the global
 * unread/all inbox filter (that lives only on the segment control). Calling
 * `toggle(item)` flips the thread between read and unread for the caller and
 * invalidates the list/thread caches so the rail + sidebar badges update:
 *
 *  - chat (`comms`): `unreadCount > 0` → {@link markRead} (watermark = newest
 *    loaded message); otherwise → {@link markUnread} (server rewinds the
 *    watermark so the latest inbound message counts as unread). The global
 *    "Непрочитанные/Все" filter is untouched.
 *  - mail: message-level `mail.markRead({ isRead })` on the thread's latest
 *    message (the per-thread mail-unread aggregate is backend #521); we read
 *    its current `isRead` to decide the flip.
 *  - system: notifications have no per-thread read mutation yet → no-op.
 *
 * Cache-first (AGENTS.md #9): mutations only INVALIDATE caches; on-screen rows
 * are never blanked — the authoritative refetch replaces them.
 */
export function useToggleThreadUnread() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const invalidateChat = useCallback(
		async (threadId: string) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: trpc.comms.listThreads.queryKey({ limit: 50 }),
				}),
				queryClient.invalidateQueries({
					queryKey: trpc.comms.getThread.queryKey({ threadId }),
				}),
			]);
		},
		[queryClient, trpc],
	);

	const commsMarkRead = useMutation(
		trpc.comms.markRead.mutationOptions({
			onError: (error) =>
				logger.error("[InboxView] comms markRead failed", error),
		}),
	);
	const commsMarkUnread = useMutation(
		trpc.comms.markUnread.mutationOptions({
			onError: (error) =>
				logger.error("[InboxView] comms markUnread failed", error),
		}),
	);
	const mailMarkRead = useMutation(
		trpc.mail.markRead.mutationOptions({
			onError: (error) =>
				logger.error("[InboxView] mail markRead failed", error),
		}),
	);

	const toggleChat = useCallback(
		async (item: InboxItem) => {
			const { threadId } = item;
			if (item.unreadCount > 0) {
				// Currently unread → mark read. Watermark = the newest message in the
				// loaded thread cache (falls back to a thread refetch if absent).
				const cached = queryClient.getQueryData(
					trpc.comms.getThread.queryKey({ threadId }),
				);
				let lastReadMessageId = cached?.messages.at(-1)?.id ?? null;
				if (!lastReadMessageId) {
					const fresh = await queryClient.fetchQuery(
						trpc.comms.getThread.queryOptions({ threadId }),
					);
					lastReadMessageId = fresh.messages.at(-1)?.id ?? null;
				}
				if (!lastReadMessageId) return; // empty thread: nothing to read
				await commsMarkRead.mutateAsync({ threadId, lastReadMessageId });
			} else {
				// Currently read → mark unread (server rewinds the watermark).
				await commsMarkUnread.mutateAsync({ threadId });
			}
			await invalidateChat(threadId);
		},
		[commsMarkRead, commsMarkUnread, invalidateChat, queryClient, trpc],
	);

	const toggleMail = useCallback(
		async (item: InboxItem) => {
			const { threadId } = item;
			// Operate on the thread's latest message (message-level contract).
			const thread = await queryClient.fetchQuery(
				trpc.mail.getThread.queryOptions({ threadId }),
			);
			const latest = thread.messages.at(-1);
			if (!latest) return;
			await mailMarkRead.mutateAsync({
				messageId: latest.id,
				isRead: !latest.isRead,
			});
			await queryClient.invalidateQueries({
				queryKey: trpc.mail.getThread.queryKey({ threadId }),
			});
			await queryClient.invalidateQueries({
				queryKey: trpc.mail.listThreads.queryKey({ limit: 50 }),
			});
		},
		[mailMarkRead, queryClient, trpc],
	);

	return useCallback(
		(item: InboxItem | null) => {
			if (!item) return;
			if (item.source === "chat") {
				void toggleChat(item);
			} else if (item.source === "mail") {
				void toggleMail(item);
			}
			// system rows: no per-thread read mutation yet.
		},
		[toggleChat, toggleMail],
	);
}
