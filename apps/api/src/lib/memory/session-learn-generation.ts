/**
 * Per-session skill-learning core (journal-memory epic, phase 2).
 *
 * Reconcile loop: find chat sessions that recently went idle and have NOT yet
 * been learned (`learned_at IS NULL`), read each transcript from durable-streams,
 * ask the cheap house model (Rox R1 → Groq Compound, the same backend the daily
 * digest uses) for durable memories, and upsert them as `memory_items`
 * (source=agent, status=suggested, sourceRef={sessionId}). Each processed session
 * is stamped with `learned_at` so it is never extracted twice — idempotent by
 * construction, independent of whether any memory was produced.
 *
 * Server-side only (the desktop may be closed). Writes go through the normal db
 * client; Electric replicates them to the desktop collection. Pure prompt +
 * transforms live in `session-learn.ts` (db-free, unit-tested).
 */

import { db } from "@rox/db/client";
import { chatSessions, memoryItems } from "@rox/db/schema";
import { and, asc, eq, gt, isNull, lt } from "drizzle-orm";
import { callR1Json, isR1Configured } from "../r1";
import { readSessionTranscript } from "../session-transcript";
import {
	MAX_MEMORIES_PER_SESSION,
	MAX_SESSIONS_PER_TICK,
	MAX_TRANSCRIPT_CHARS,
	SESSION_LEARN_SYSTEM_PROMPT,
	type SessionMemory,
	sanitizeSessionMemories,
} from "./session-learn";

/**
 * A session is considered "ended" once it has been quiet for this long. There is
 * no explicit end event (chat_session_status is only active|archived), so idle
 * time is the signal. ~10 min matches the founder's "shortly after it ends"
 * (~5-min cadence) intent without learning a session the user is mid-way through.
 */
export const IDLE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Don't reach back further than this for a first-time learn. Caps the catch-up
 * surface if the reconcile was paused, and keeps the index scan bounded.
 */
export const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export interface LearnSessionsResult {
	/** Sessions inspected this tick (stamped learned, whether or not they yielded memories). */
	processed: number;
	/** Sessions skipped because their transcript was empty/expired (still stamped). */
	emptyTranscripts: number;
	/** New memory_items inserted across all processed sessions. */
	memoriesInserted: number;
	/** True when no R1 backend is configured (nothing was attempted). */
	skippedUnconfigured?: boolean;
}

interface SessionRow {
	id: string;
	organizationId: string;
	createdBy: string;
	title: string | null;
}

/**
 * Find unlearned sessions that recently went idle and are not older than the
 * lookback horizon, oldest-idle first, capped at {@link MAX_SESSIONS_PER_TICK}.
 */
async function findUnlearnedIdleSessions(now: Date): Promise<SessionRow[]> {
	const idleBefore = new Date(now.getTime() - IDLE_WINDOW_MS);
	const lookbackAfter = new Date(now.getTime() - MAX_LOOKBACK_MS);

	return db
		.select({
			id: chatSessions.id,
			organizationId: chatSessions.organizationId,
			createdBy: chatSessions.createdBy,
			title: chatSessions.title,
		})
		.from(chatSessions)
		.where(
			and(
				isNull(chatSessions.learnedAt),
				lt(chatSessions.lastActiveAt, idleBefore),
				gt(chatSessions.lastActiveAt, lookbackAfter),
			),
		)
		.orderBy(asc(chatSessions.lastActiveAt))
		.limit(MAX_SESSIONS_PER_TICK);
}

/**
 * Extract durable memories from one session transcript via the cheap house model.
 * Returns [] when R1 is unconfigured or there is nothing worth remembering;
 * swallows model/parse errors (logged) so one bad session never fails the tick.
 */
export async function extractSessionMemories(
	transcript: string,
): Promise<SessionMemory[]> {
	if (!isR1Configured() || transcript.trim().length === 0) return [];
	try {
		const raw = await callR1Json<{ memories?: unknown }>(
			[
				{ role: "system", content: SESSION_LEARN_SYSTEM_PROMPT },
				{ role: "user", content: transcript.slice(0, MAX_TRANSCRIPT_CHARS) },
			],
			{ temperature: 0.2, maxTokens: 1_024 },
		);
		return sanitizeSessionMemories(raw?.memories);
	} catch (error) {
		console.error(
			"[memory/learn] extraction failed",
			String(error).slice(0, 300),
		);
		return [];
	}
}

/**
 * Insert session memories as `memory_items` (source=agent, status=suggested),
 * skipping bodies the user already has in the same category (any status) so
 * re-learning across sessions never piles up duplicates. Mirrors the journal
 * digest's exact-string dedup (case-insensitive, trimmed). pgvector/embedding
 * dedup is a deliberate follow-up, not built here.
 */
async function upsertSessionMemories(args: {
	organizationId: string;
	userId: string;
	sessionId: string;
	memories: SessionMemory[];
}): Promise<number> {
	const { organizationId, userId, sessionId, memories } = args;
	if (memories.length === 0) return 0;

	const existing = await db
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

	const fresh: SessionMemory[] = [];
	for (const m of memories) {
		const key = `${m.category}::${m.body.trim().toLowerCase()}`;
		if (seen.has(key)) continue;
		seen.add(key); // also de-dupe within this batch
		fresh.push(m);
	}
	if (fresh.length === 0) return 0;

	await db.insert(memoryItems).values(
		fresh.map((m) => ({
			organizationId,
			createdBy: userId,
			category: m.category,
			body: m.body,
			source: "agent" as const,
			status: "suggested" as const,
			sourceRef: { sessionId },
		})),
	);
	return fresh.length;
}

/**
 * Stamp a session as learned. Conditioned on `learned_at IS NULL` so two
 * overlapping reconcile ticks can't both claim the same session (the second
 * UPDATE matches zero rows). Returns true when this call won the claim.
 */
async function markSessionLearned(
	sessionId: string,
	now: Date,
): Promise<boolean> {
	const updated = await db
		.update(chatSessions)
		.set({ learnedAt: now })
		.where(and(eq(chatSessions.id, sessionId), isNull(chatSessions.learnedAt)))
		.returning({ id: chatSessions.id });
	return updated.length > 0;
}

/**
 * One reconcile pass: distil every unlearned, recently-idle session. Each session
 * is stamped exactly once (even when its transcript is empty or yields no
 * memories), so the next tick moves on. Safe to call on a `*\/5 * * * *` schedule.
 */
export async function learnIdleSessions(
	now: Date = new Date(),
): Promise<LearnSessionsResult> {
	if (!isR1Configured()) {
		return {
			processed: 0,
			emptyTranscripts: 0,
			memoriesInserted: 0,
			skippedUnconfigured: true,
		};
	}

	const sessions = await findUnlearnedIdleSessions(now);

	let processed = 0;
	let emptyTranscripts = 0;
	let memoriesInserted = 0;

	for (const session of sessions) {
		// Claim the session first so a concurrent tick won't also process it.
		const claimed = await markSessionLearned(session.id, now);
		if (!claimed) continue;
		processed += 1;

		const transcript = await readSessionTranscript(session.id, {
			maxChars: MAX_TRANSCRIPT_CHARS,
		});
		if (!transcript) {
			emptyTranscripts += 1;
			continue;
		}

		const memories = await extractSessionMemories(transcript);
		if (memories.length === 0) continue;

		memoriesInserted += await upsertSessionMemories({
			organizationId: session.organizationId,
			userId: session.createdBy,
			sessionId: session.id,
			memories: memories.slice(0, MAX_MEMORIES_PER_SESSION),
		});
	}

	return { processed, emptyTranscripts, memoriesInserted };
}
