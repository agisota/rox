import type { RouterOutputs } from "@rox/trpc";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";
import { buildSendRecipients } from "../../utils/buildSendRecipients";

type ThreadResult = RouterOutputs["comms"]["getThread"];
export type CommsMessage = ThreadResult["messages"][number];
export type CommsThreadDetail = ThreadResult["thread"];
export type CommsParticipant = ThreadResult["participants"][number];

interface UseCommsThreadResult {
	thread: CommsThreadDetail | null;
	messages: CommsMessage[];
	participants: CommsParticipant[];
	isLoading: boolean;
	error: string | null;
	sending: boolean;
	sendError: string | null;
	/** Reply within this thread. Returns true on success. */
	reply: (body: string) => Promise<boolean>;
	refresh: () => Promise<void>;
}

/**
 * A single comms thread plus its messages + participants, with inline reply.
 * Imperative tRPC pattern (Mail analog) — comms has no mobile Electric path, so
 * there is no live query: new messages appear on pull-to-refresh, re-open, or
 * after the user's own send refetch (SSE is deliberately deferred for mobile).
 *
 * Cache-first: existing `messages` stay rendered while a refresh runs (`load()`
 * only replaces on success). On open, the thread is marked read at the latest
 * message id (fired once per new tail via a ref key, errors swallowed).
 */
export function useCommsThread(
	threadId: string | undefined,
): UseCommsThreadResult {
	const { data: session } = useSession();
	const currentUserId = session?.user?.id;

	const [thread, setThread] = useState<CommsThreadDetail | null>(null);
	const [messages, setMessages] = useState<CommsMessage[]>([]);
	const [participants, setParticipants] = useState<CommsParticipant[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [sending, setSending] = useState(false);
	const [sendError, setSendError] = useState<string | null>(null);

	// Dedupe markRead: only fire when the (threadId, latestMessageId) tail changes
	// (mirror web useThread.ts:40-62) so re-renders don't spam the mutation.
	const markedTailRef = useRef<string | null>(null);

	const load = useCallback(async () => {
		if (!threadId) {
			setIsLoading(false);
			return;
		}
		setError(null);
		try {
			const result = await apiClient.comms.getThread.query({ threadId });
			setThread(result.thread);
			setMessages(result.messages);
			setParticipants(result.participants);

			// Mark read at the newest message once per new tail; needs a real id
			// (an empty thread has nothing to mark). Non-fatal on failure.
			const latest = result.messages[result.messages.length - 1];
			if (latest) {
				const tailKey = `${threadId}:${latest.id}`;
				if (markedTailRef.current !== tailKey) {
					markedTailRef.current = tailKey;
					apiClient.comms.markRead
						.mutate({ threadId, lastReadMessageId: latest.id })
						.catch(() => {
							// Read-watermark is best-effort; swallow so the open never fails.
						});
				}
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load thread");
		} finally {
			setIsLoading(false);
		}
	}, [threadId]);

	useEffect(() => {
		setIsLoading(true);
		void load();
	}, [load]);

	const refresh = useCallback(async () => {
		await load();
	}, [load]);

	const reply = useCallback(
		async (body: string) => {
			if (!threadId) return false;
			const trimmed = body.trim();
			if (trimmed.length === 0) return false;

			// comms.sendMessage REQUIRES >=1 recipient even when appending to an
			// existing thread (schema.ts:40); derive the rox-user set minus self.
			const recipients = buildSendRecipients(participants, currentUserId);
			if (recipients.length === 0) {
				setSendError("No recipient to reply to.");
				return false;
			}

			setSending(true);
			setSendError(null);
			try {
				await apiClient.comms.sendMessage.mutate({
					threadId,
					recipients,
					body: trimmed,
					clientId: randomUUID(),
				});
				await load();
				return true;
			} catch (err) {
				setSendError(err instanceof Error ? err.message : "Failed to send");
				return false;
			} finally {
				setSending(false);
			}
		},
		[threadId, participants, currentUserId, load],
	);

	return {
		thread,
		messages,
		participants,
		isLoading,
		error,
		sending,
		sendError,
		reply,
		refresh,
	};
}
