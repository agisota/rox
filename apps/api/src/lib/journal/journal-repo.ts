/**
 * Journal persistence — journal-memory epic.
 *
 * The transactional write shared by both journal flows (real daily digest and
 * GitHub seed): upsert the `journal_entries` row, then materialize its memory
 * suggestions as `memory_items` (source=agent, status=suggested). The two flows
 * differ only in conflict strategy and `sourceSessionIds`, so they pass those in
 * and otherwise share this code. Pure stream transforms live in
 * `journal-streams.ts`; orchestration lives in `journal-generation.ts`.
 */

import type { dbWs } from "@rox/db/client";
import {
	type JournalMemorySuggestion,
	journalEntries,
	memoryItems,
} from "@rox/db/schema";
import { and, eq } from "drizzle-orm";
import type { JournalStreams } from "./journal-streams";

/** Transaction handle as passed to a `dbWs.transaction` callback. */
export type JournalTx = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

/**
 * Conflict strategy for the `journal_entries` upsert:
 * - `update`: clobber an existing (org, user, day) row (the real daily digest
 *   owns the day and always regenerates).
 * - `ignore`: never clobber a concurrently-created entry (the GitHub seed defers
 *   to whoever won the day); the row is omitted from `returning()`.
 */
export type JournalConflict = "update" | "ignore";

/**
 * Upsert the journal entry row and materialize its memory suggestions inside the
 * given transaction. Returns `null` only when `conflict` is `ignore` and the row
 * already existed (so nothing was inserted/returned); otherwise returns the new
 * entry id and the count of freshly inserted memory items.
 */
export async function persistJournalEntry(
	tx: JournalTx,
	args: {
		organizationId: string;
		userId: string;
		day: string;
		streams: JournalStreams;
		sourceSessionIds: string[];
		conflict: JournalConflict;
	},
): Promise<{ entryId: string; memoryCount: number } | null> {
	const { organizationId, userId, day, streams, sourceSessionIds, conflict } =
		args;
	const now = new Date();

	const insert = tx.insert(journalEntries).values({
		organizationId,
		createdBy: userId,
		day,
		reflection: streams.reflection || null,
		learnings: streams.learnings,
		memorySuggestions: streams.memorySuggestions,
		tips: streams.tips,
		status: "generated",
		modelId: "rox-r1",
		sourceSessionIds,
		generatedAt: now,
	});

	const conflictTarget = [
		journalEntries.organizationId,
		journalEntries.createdBy,
		journalEntries.day,
	];

	const [entry] =
		conflict === "update"
			? await insert
					.onConflictDoUpdate({
						target: conflictTarget,
						set: {
							reflection: streams.reflection || null,
							learnings: streams.learnings,
							memorySuggestions: streams.memorySuggestions,
							tips: streams.tips,
							status: "generated",
							modelId: "rox-r1",
							sourceSessionIds,
							generatedAt: now,
							updatedAt: now,
						},
					})
					.returning({ id: journalEntries.id })
			: // Do NOT clobber a concurrently-created entry — a race means the digest
				// (or another seed) won the day; treat it as an existing entry.
				await insert
					.onConflictDoNothing({ target: conflictTarget })
					.returning({ id: journalEntries.id });

	if (conflict === "ignore" && !entry) return null;

	const memoryCount = await materializeMemorySuggestions(tx, {
		organizationId,
		userId,
		day,
		suggestions: streams.memorySuggestions,
	});

	return { entryId: entry?.id ?? "", memoryCount };
}

/**
 * Insert journal memory suggestions as `memory_items` (source=agent,
 * status=suggested), skipping bodies the user already has in the same category
 * (any status) so re-generation doesn't pile up duplicates.
 */
async function materializeMemorySuggestions(
	tx: JournalTx,
	args: {
		organizationId: string;
		userId: string;
		day: string;
		suggestions: JournalMemorySuggestion[];
	},
): Promise<number> {
	const { organizationId, userId, day, suggestions } = args;
	if (suggestions.length === 0) return 0;

	const existing = await tx
		.select({ body: memoryItems.body, category: memoryItems.category })
		.from(memoryItems)
		.where(
			and(
				eq(memoryItems.organizationId, organizationId),
				eq(memoryItems.createdBy, userId),
			),
		);
	const seen = new Set(
		existing.map((e) => `${e.category}::${e.body.trim().toLowerCase()}`),
	);

	const fresh = suggestions.filter(
		(s) => !seen.has(`${s.category}::${s.body.trim().toLowerCase()}`),
	);
	if (fresh.length === 0) return 0;

	await tx.insert(memoryItems).values(
		fresh.map((s) => ({
			organizationId,
			createdBy: userId,
			category: s.category,
			body: s.body,
			source: "agent" as const,
			status: "suggested" as const,
			sourceRef: { day },
		})),
	);
	return fresh.length;
}
