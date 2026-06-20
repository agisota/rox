/**
 * Journal generation core — journal-memory epic.
 *
 * Given a user + day, reads that day's chat sessions (Neon) and their
 * transcripts (durable-streams), asks Rox R1 for the four journal streams as
 * strict JSON, then upserts a `journal_entries` row and materializes the memory
 * suggestions as `memory_items` (source=agent, status=suggested). Idempotent on
 * (organization_id, created_by, day): re-running regenerates the row.
 *
 * Server-side only (the desktop may be closed). Writes go through the normal db
 * client; Electric replicates them to the desktop collection. Pure stream
 * transforms live in `journal-streams.ts` (db-free, unit-tested); the shared
 * transactional persistence lives in `journal-repo.ts`; the GitHub profile
 * summary + seed sentinel live in `journal-github.ts`.
 */

import { db, dbWs } from "@rox/db/client";
import { chatSessions, journalEntries } from "@rox/db/schema";
import { and, eq, gte, lt } from "drizzle-orm";
import { callR1Json, isR1Configured, type R1Message } from "../r1";
import { readSessionTranscript } from "../session-transcript";
import {
	buildGithubProfileSummary,
	isSeedEntry,
	SEED_SOURCE_MARKER,
} from "./journal-github";
import { persistJournalEntry } from "./journal-repo";
import { buildSeedMessages, shapeSeedStreams } from "./journal-seed";
import {
	dayBounds,
	JOURNAL_SYSTEM_PROMPT,
	type JournalStreams,
	MAX_SESSIONS_PER_DAY,
	MAX_TRANSCRIPT_CHARS_PER_SESSION,
	sanitizeStreams,
} from "./journal-streams";

// Re-exported here to keep this module's public surface stable: the seed
// sentinel + predicate are defined in `journal-github.ts`.
export { isSeedEntry, SEED_SOURCE_MARKER };

export interface GenerateJournalInput {
	organizationId: string;
	userId: string;
	/** UTC calendar day, `YYYY-MM-DD`. */
	day: string;
}

export type GenerateJournalResult =
	| {
			status: "generated";
			entryId: string;
			sessionCount: number;
			memoryCount: number;
	  }
	| {
			status: "skipped";
			reason: "no-sessions" | "no-transcript" | "r1-unconfigured";
	  };

/**
 * Generate (or regenerate) the journal entry for one user/day. Returns a
 * `skipped` result when there is nothing to summarize or R1 is unconfigured,
 * rather than throwing, so a batch runner can continue to the next user.
 */
export async function generateJournalForUserDay(
	input: GenerateJournalInput,
): Promise<GenerateJournalResult> {
	if (!isR1Configured())
		return { status: "skipped", reason: "r1-unconfigured" };

	const { organizationId, userId, day } = input;
	const { start, end } = dayBounds(day);

	const sessions = await db
		.select({ id: chatSessions.id, title: chatSessions.title })
		.from(chatSessions)
		.where(
			and(
				eq(chatSessions.createdBy, userId),
				eq(chatSessions.organizationId, organizationId),
				gte(chatSessions.lastActiveAt, start),
				lt(chatSessions.lastActiveAt, end),
			),
		)
		.limit(MAX_SESSIONS_PER_DAY);

	if (sessions.length === 0)
		return { status: "skipped", reason: "no-sessions" };

	const transcripts: string[] = [];
	const usedSessionIds: string[] = [];
	for (const session of sessions) {
		const transcript = await readSessionTranscript(session.id, {
			maxChars: MAX_TRANSCRIPT_CHARS_PER_SESSION,
		});
		if (!transcript) continue;
		usedSessionIds.push(session.id);
		const title = session.title?.trim() || "Без названия";
		transcripts.push(`## Сессия «${title}»\n${transcript}`);
	}

	if (transcripts.length === 0)
		return { status: "skipped", reason: "no-transcript" };

	const messages: R1Message[] = [
		{ role: "system", content: JOURNAL_SYSTEM_PROMPT },
		{
			role: "user",
			content: `Дата: ${day}\nКоличество сессий: ${transcripts.length}\n\n${transcripts.join("\n\n---\n\n")}`,
		},
	];

	const rawStreams = await callR1Json<Partial<JournalStreams>>(messages, {
		temperature: 0.4,
		maxTokens: 2_048,
	});
	const streams = sanitizeStreams(rawStreams);

	const { entryId, memoryCount } = await dbWs.transaction(async (tx) => {
		const written = await persistJournalEntry(tx, {
			organizationId,
			userId,
			day,
			streams,
			sourceSessionIds: usedSessionIds,
			conflict: "update",
		});
		return {
			entryId: written?.entryId ?? "",
			memoryCount: written?.memoryCount ?? 0,
		};
	});

	return {
		status: "generated",
		entryId,
		sessionCount: usedSessionIds.length,
		memoryCount,
	};
}

// ---------------------------------------------------------------------------
// GitHub-seeded first journal entry (journal-memory epic).
//
// When a brand-new user has no chat sessions for the day and no journal entry
// yet, seed a warm onboarding entry from their GitHub profile so the Журнал
// isn't empty on day one. The seed is marked via `SEED_SOURCE_MARKER` so a
// later real daily digest still regenerates the same (org, user, day) row.
// ---------------------------------------------------------------------------

export type GenerateJournalSeedResult =
	| {
			status: "seeded";
			entryId: string;
			repoCount: number;
			prCount: number;
			memoryCount: number;
	  }
	| {
			status: "skipped";
			reason:
				| "r1-unconfigured"
				| "no-github"
				| "has-entry"
				| "already-seeded"
				| "has-sessions";
	  };

/**
 * Seed a first journal entry for `(organization, user, day)` from the org's
 * GitHub profile. Safe + idempotent: never clobbers an existing entry, defers
 * to the normal digest when the day has real sessions, and skips (not throws)
 * when there is no GitHub installation or R1 is unconfigured.
 */
export async function generateJournalSeedForUser(
	input: GenerateJournalInput,
): Promise<GenerateJournalSeedResult> {
	if (!isR1Configured())
		return { status: "skipped", reason: "r1-unconfigured" };

	const { organizationId, userId, day } = input;
	const { start, end } = dayBounds(day);

	// Guard A: never overwrite an existing entry (real digest or prior seed).
	const [existing] = await db
		.select({ sourceSessionIds: journalEntries.sourceSessionIds })
		.from(journalEntries)
		.where(
			and(
				eq(journalEntries.organizationId, organizationId),
				eq(journalEntries.createdBy, userId),
				eq(journalEntries.day, day),
			),
		)
		.limit(1);
	if (existing)
		return {
			status: "skipped",
			reason: isSeedEntry(existing.sourceSessionIds)
				? "already-seeded"
				: "has-entry",
		};

	// Guard B: the normal digest owns any day with real chat sessions.
	const [session] = await db
		.select({ id: chatSessions.id })
		.from(chatSessions)
		.where(
			and(
				eq(chatSessions.createdBy, userId),
				eq(chatSessions.organizationId, organizationId),
				gte(chatSessions.lastActiveAt, start),
				lt(chatSessions.lastActiveAt, end),
			),
		)
		.limit(1);
	if (session) return { status: "skipped", reason: "has-sessions" };

	const summary = await buildGithubProfileSummary(organizationId);
	if (!summary) return { status: "skipped", reason: "no-github" };

	const rawStreams = await callR1Json<Partial<JournalStreams>>(
		buildSeedMessages(summary),
		{ temperature: 0.5, maxTokens: 2_048 },
	);
	const streams = shapeSeedStreams(rawStreams);

	const written = await dbWs.transaction(async (tx) =>
		persistJournalEntry(tx, {
			organizationId,
			userId,
			day,
			streams,
			sourceSessionIds: [SEED_SOURCE_MARKER],
			conflict: "ignore",
		}),
	);
	if (!written) return { status: "skipped", reason: "has-entry" };

	return {
		status: "seeded",
		entryId: written.entryId,
		repoCount: summary.repos.length,
		prCount: summary.recentPrs.length,
		memoryCount: written.memoryCount,
	};
}
