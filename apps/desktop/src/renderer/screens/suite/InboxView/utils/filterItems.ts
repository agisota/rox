import type { InboxFilter, InboxItem, InboxStatusFilter } from "../types";

/** Predicate set the filter needs from the triage store (kept injectable). */
export interface TriagePredicates {
	isArchived: (key: string) => boolean;
	isSnoozed: (key: string) => boolean;
}

export interface FilterInboxArgs {
	items: readonly InboxItem[];
	filter: InboxFilter;
	status: InboxStatusFilter;
	/** Lower-cased, trimmed search query (already debounced upstream). */
	query: string;
	triage: TriagePredicates;
}

/**
 * Pure filter pipeline for the inbox list. Applies, in order: the triage view
 * (active streams hide archived + snoozed rows; the Архив/Сохранённое views show
 * exactly those), the source slice (chat/mail/system), the unread/all status
 * segment, and the client-side text query (subject/preview). Kept pure so the
 * filter matrix is unit-testable.
 */
export function filterInboxItems({
	items,
	filter,
	status,
	query,
	triage,
}: FilterInboxArgs): InboxItem[] {
	const q = query.trim().toLowerCase();
	return items.filter((item) => {
		const archived = triage.isArchived(item.key);
		const snoozed = triage.isSnoozed(item.key);

		// Triage view gating.
		if (filter === "archive") {
			if (!archived) return false;
		} else if (filter === "snoozed") {
			if (!snoozed) return false;
		} else {
			// Active streams never show archived or snoozed rows.
			if (archived || snoozed) return false;
		}

		// Source slice (the triage views are cross-source, so skip there).
		if (
			(filter === "chat" || filter === "mail" || filter === "system") &&
			item.source !== filter
		) {
			return false;
		}

		// Unread/all status segment.
		if (status === "unread" && item.unreadCount === 0) return false;

		// Text query over title + preview.
		if (q.length > 0) {
			const haystack = `${item.title} ${item.preview}`.toLowerCase();
			if (!haystack.includes(q)) return false;
		}

		return true;
	});
}
