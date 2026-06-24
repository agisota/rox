import type { SelectJournalEvent } from "@rox/db/schema";

/** The two lanes of the journal surface. */
export type JournalTab = "feed" | "reflection";

/** Feed kind filter (maps to `journal_events.kind`). */
export type FeedKindFilter = "all" | "automation_run" | "ambient_nudge";

/**
 * Feed status filter — a coarse bucket over the raw `payload.status` /
 * `payload.source` discriminators so the user filters by outcome, not by the
 * exact dispatch enum.
 */
export type FeedStatusFilter = "all" | "success" | "error" | "skipped" | "info";

/** URL-search state for the journal route (linkable + reload-stable). */
export interface JournalSearch {
	tab?: JournalTab;
	kind?: FeedKindFilter;
	status?: FeedStatusFilter;
	q?: string;
}

/**
 * Resolve the status discriminator for an event. Ambient nudges carry
 * `payload.source = 'ambient'` (no automation status); fall back to that so they
 * still get a coloured dot/bucket in the feed. Mirrors the original
 * `eventStatus` in the legacy JournalFeed.
 */
export function eventStatus(event: SelectJournalEvent): string | undefined {
	const payload = event.payload as {
		status?: unknown;
		source?: unknown;
	} | null;
	const status = payload?.status;
	if (typeof status === "string") return status;
	const source = payload?.source;
	return typeof source === "string" ? source : undefined;
}

/** Map a raw status discriminator into the coarse filter bucket. */
export function statusBucket(status: string | undefined): FeedStatusFilter {
	switch (status) {
		case "dispatched":
			return "success";
		case "dispatch_failed":
			return "error";
		case "skipped_offline":
			return "skipped";
		case "conflict":
			return "skipped";
		default:
			// dispatching / ambient / unknown producers → informational.
			return "info";
	}
}

/** Does an event pass the active (client-side) filter set? */
export function eventMatchesFilters(
	event: SelectJournalEvent,
	kind: FeedKindFilter,
	status: FeedStatusFilter,
	query: string,
): boolean {
	if (kind !== "all" && event.kind !== kind) return false;
	if (status !== "all" && statusBucket(eventStatus(event)) !== status) {
		return false;
	}
	if (query) {
		const haystack = `${event.title} ${event.summary ?? ""}`.toLowerCase();
		if (!haystack.includes(query.toLowerCase())) return false;
	}
	return true;
}
