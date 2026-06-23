import type { RouterOutputs } from "@rox/trpc";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/trpc/client";

type ThreadResult = RouterOutputs["mail"]["getThread"];
export type MailMessage = ThreadResult["messages"][number];
export type MailThreadDetail = ThreadResult["thread"];

interface UseMailThreadResult {
	thread: MailThreadDetail | null;
	messages: MailMessage[];
	isLoading: boolean;
	error: string | null;
	sending: boolean;
	sendError: string | null;
	/** Reply within this thread. Returns true on success. */
	reply: (body: string) => Promise<boolean>;
	refresh: () => Promise<void>;
}

/** A single mailbox thread plus its messages, with inline reply. */
export function useMailThread(
	threadId: string | undefined,
): UseMailThreadResult {
	const [thread, setThread] = useState<MailThreadDetail | null>(null);
	const [messages, setMessages] = useState<MailMessage[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [sending, setSending] = useState(false);
	const [sendError, setSendError] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!threadId) {
			setIsLoading(false);
			return;
		}
		setError(null);
		try {
			const result = await apiClient.mail.getThread.query({ threadId });
			setThread(result.thread);
			setMessages(result.messages);
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
			// Reply targets the latest inbound counterpart; the server derives the
			// recipient set + RFC headers from the parent thread, so we send to the
			// last sender we have on record.
			const last = messages[messages.length - 1];
			const to = last?.fromAddr ? [last.fromAddr] : [];
			if (to.length === 0) {
				setSendError("No recipient to reply to.");
				return false;
			}
			setSending(true);
			setSendError(null);
			try {
				await apiClient.mail.send.mutate({
					threadId,
					to,
					subject: thread?.subjectNorm ?? undefined,
					body: trimmed,
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
		[threadId, thread, messages, load],
	);

	return {
		thread,
		messages,
		isLoading,
		error,
		sending,
		sendError,
		reply,
		refresh,
	};
}
