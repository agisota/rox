import { useQuery } from "@tanstack/react-query";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { sumThreadUnread } from "../utils/sumThreadUnread";

/**
 * The single source of truth for "total unread across the inbox", lifted out of
 * {@link useInboxData} so the dashboard sidebar can feed its «Входящие» badge
 * without mounting the full inbox list (issue #562).
 *
 * Keyed on the same `comms.listThreads` query as the inbox, so the two share one
 * cache entry: `useCommsStream` already invalidates it on SSE events, which makes
 * this badge recompute live with no extra wiring. Cache-first — a cached count
 * renders immediately while the query refreshes in the background.
 *
 * Mail unread is chat-only for now (per-user mail aggregate is backend #521);
 * this hook will pick it up automatically once `mail.listThreads` rows carry a
 * real `unreadCount`.
 */
export function useUnreadCount(): number {
	const trpc = useTRPC();
	const chatQuery = useQuery(
		trpc.comms.listThreads.queryOptions({ limit: 50 }),
	);
	return sumThreadUnread(chatQuery.data ?? []);
}
