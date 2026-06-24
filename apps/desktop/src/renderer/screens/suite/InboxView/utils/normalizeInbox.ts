import type { InboxItem } from "../types";
import { formatThreadTitle } from "./formatThreadTitle";

/**
 * Pure normalization of the two transport thread lists into the unified
 * {@link InboxItem} stream. Kept React/tRPC-free so the merge + sort + dedupe
 * contract is unit-testable without booting the renderer client.
 *
 * The desktop `comms.listThreads` / `mail.listThreads` procedures return raw
 * Drizzle `$inferSelect` rows (see packages/trpc/src/router/{comms,mail}); we
 * only depend on the stable columns each guarantees.
 */

/** The chat-thread row shape we consume (subset of `comms.listThreads`). */
export interface ChatThreadRow {
	id: string;
	subject: string | null;
	lastMessageAt: Date | string | null;
	unreadCount: number;
}

/** The mail-thread row shape we consume (subset of `mail.listThreads`). */
export interface MailThreadRow {
	id: string;
	subjectNorm: string | null;
	lastMessageAt: Date | string | null;
	messageCount: number;
}

function toDate(value: Date | string | null): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** Normalize one chat thread into an inbox row. */
export function normalizeChatThread(row: ChatThreadRow): InboxItem {
	return {
		key: `chat:${row.id}`,
		source: "chat",
		threadId: row.id,
		title: formatThreadTitle({ subject: row.subject, id: row.id }),
		preview:
			row.unreadCount > 0
				? `${row.unreadCount} непрочитанных`
				: "Открыть переписку",
		timestamp: toDate(row.lastMessageAt),
		unreadCount: row.unreadCount,
	};
}

/** Normalize one mail thread into an inbox row. */
export function normalizeMailThread(row: MailThreadRow): InboxItem {
	const subject = row.subjectNorm?.trim();
	return {
		key: `mail:${row.id}`,
		source: "mail",
		threadId: row.id,
		title: subject || "(без темы)",
		preview: `${row.messageCount} сообщ.`,
		timestamp: toDate(row.lastMessageAt),
		// Mail threads do not carry a per-user unread count yet (the message-level
		// `isRead` is resolved in the reader); treat the list row as read.
		unreadCount: 0,
	};
}

/**
 * Merge + sort + dedupe the two transports into the unified stream. Rows are
 * sorted newest-first by `timestamp` (nulls last) and de-duplicated by `key`
 * (`${source}:${threadId}`) so a transport that double-reports a thread never
 * yields two rows.
 */
export function mergeInboxItems(
	chat: readonly ChatThreadRow[],
	mail: readonly MailThreadRow[],
): InboxItem[] {
	const byKey = new Map<string, InboxItem>();
	for (const row of chat) {
		const item = normalizeChatThread(row);
		byKey.set(item.key, item);
	}
	for (const row of mail) {
		const item = normalizeMailThread(row);
		byKey.set(item.key, item);
	}
	return [...byKey.values()].sort((a, b) => {
		const at = a.timestamp?.getTime() ?? 0;
		const bt = b.timestamp?.getTime() ?? 0;
		return bt - at;
	});
}
