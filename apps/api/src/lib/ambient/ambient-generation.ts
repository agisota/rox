/**
 * Ambient agent core (ambient-intelligence epic, phase 4b, "Act").
 *
 * Reconcile loop, mirrored on phase-2 session-learning. Each `*\/5` tick:
 *   1. find users who opted in (`user_ambient_settings.ambient_enabled = true`);
 *   2. for each, enforce a global per-user hourly cap by counting recent
 *      `ambient_nudge` journal_events (skip when the cap is hit);
 *   3. require a fresh idle-session signal — a chat session that went idle since
 *      this user's last nudge — so we only nudge when something actually
 *      happened (idempotent + ≤1 nudge per user per run);
 *   4. ask the cheap house model (Rox R1 → Groq Compound — the SAME backend the
 *      journal digest + session-learn use) for ONE short nudge, built from the
 *      user's approved memories + recent events + optional persona;
 *   5. write the nudge as a `journal_events` row (`kind='ambient_nudge'`), so it
 *      appears in the existing journal "Лента" with no new table or UI.
 *
 * Server-side only (the desktop may be closed). Writes go through the normal db
 * client; Electric replicates them to the desktop collection. Pure prompt +
 * transforms live in `ambient-nudge.ts` (db-free, unit-tested).
 *
 * Kill-switch + cost control: a full no-op when R1 is unconfigured OR the user
 * has not opted in; hard caps on nudges/hour, memories, events, and chars (see
 * `ambient-nudge.ts`). This is the bounded v1 — no screen-watching, no
 * always-listening (see PR follow-ups).
 */

import { db, dbWs } from "@rox/db/client";
import {
	chatSessions,
	journalEvents,
	memoryItems,
	userAmbientSettings,
} from "@rox/db/schema";
import { and, asc, count, desc, eq, gt, gte, lt } from "drizzle-orm";
import { callR1Json, isR1Configured } from "../r1";
import {
	AMBIENT_NUDGE_SYSTEM_PROMPT,
	type AmbientJournalEvent,
	type AmbientMemoryCategory,
	type AmbientMemoryItem,
	type AmbientNudge,
	buildNudgeContext,
	MAX_EVENTS,
	MAX_MEMORY_ITEMS,
	MAX_NUDGES_PER_HOUR,
	NUDGE_RATE_WINDOW_MS,
	sanitizeNudge,
} from "./ambient-nudge";

/** Discriminator for the nudge rows we write into the journal event lane. */
export const AMBIENT_NUDGE_KIND = "ambient_nudge";

/**
 * A session is "idle" once quiet for this long — the same signal phase-2 uses.
 * We only nudge a user when a session went idle since their last nudge, so the
 * trigger is "after a chat session goes idle" without firing mid-conversation.
 */
export const IDLE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Don't reach back further than this when looking for an idle-session signal.
 * Caps the index scan and prevents a long-paused reconcile from nudging on
 * ancient activity.
 */
export const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Max enabled users processed per tick (LLM cost + latency guard). */
export const MAX_USERS_PER_TICK = 50;

export interface RunAmbientResult {
	/** Enabled users inspected this tick. */
	considered: number;
	/** Users skipped because their hourly nudge cap was already hit. */
	rateLimited: number;
	/** Users skipped because no session went idle since their last nudge. */
	noSignal: number;
	/** Users where the model chose to stay silent (empty nudge) or had no context. */
	suppressed: number;
	/** Nudges actually written to the journal event lane (≤1 per user). */
	nudged: number;
	/** True when no R1 backend is configured (nothing was attempted). */
	skippedUnconfigured?: boolean;
}

interface EnabledUserRow {
	organizationId: string;
	createdBy: string;
	voiceAgentContext: string | null;
}

/** Find opted-in users (ambient_enabled = true), capped per tick. */
async function findEnabledUsers(): Promise<EnabledUserRow[]> {
	return db
		.select({
			organizationId: userAmbientSettings.organizationId,
			createdBy: userAmbientSettings.createdBy,
			voiceAgentContext: userAmbientSettings.voiceAgentContext,
		})
		.from(userAmbientSettings)
		.where(eq(userAmbientSettings.ambientEnabled, true))
		.orderBy(asc(userAmbientSettings.updatedAt))
		.limit(MAX_USERS_PER_TICK);
}

/** Count this user's nudges in the trailing rate window (the hourly cap). */
async function recentNudgeCount(
	organizationId: string,
	userId: string,
	now: Date,
): Promise<number> {
	const since = new Date(now.getTime() - NUDGE_RATE_WINDOW_MS);
	const [row] = await db
		.select({ value: count() })
		.from(journalEvents)
		.where(
			and(
				eq(journalEvents.organizationId, organizationId),
				eq(journalEvents.createdBy, userId),
				eq(journalEvents.kind, AMBIENT_NUDGE_KIND),
				gte(journalEvents.createdAt, since),
			),
		);
	return row?.value ?? 0;
}

/** Timestamp of this user's most recent nudge, or null if they've had none. */
async function lastNudgeAt(
	organizationId: string,
	userId: string,
): Promise<Date | null> {
	const [row] = await db
		.select({ createdAt: journalEvents.createdAt })
		.from(journalEvents)
		.where(
			and(
				eq(journalEvents.organizationId, organizationId),
				eq(journalEvents.createdBy, userId),
				eq(journalEvents.kind, AMBIENT_NUDGE_KIND),
			),
		)
		.orderBy(desc(journalEvents.createdAt))
		.limit(1);
	return row?.createdAt ?? null;
}

/**
 * Has a chat session gone idle since `sinceExclusive` (and within the lookback
 * horizon)? This is the "after a session goes idle" trigger: a session whose
 * last activity is older than the idle window but newer than both the lookback
 * floor and the user's last nudge. Returns true when at least one such session
 * exists, so a nudge is only emitted on fresh idle activity.
 */
async function hasFreshIdleSession(
	organizationId: string,
	userId: string,
	now: Date,
	sinceExclusive: Date | null,
): Promise<boolean> {
	const idleBefore = new Date(now.getTime() - IDLE_WINDOW_MS);
	const lookbackFloor = new Date(now.getTime() - MAX_LOOKBACK_MS);
	// Only count activity newer than the user's last nudge, so the same idle
	// session can't trigger a second nudge on a later tick.
	const floor =
		sinceExclusive && sinceExclusive > lookbackFloor
			? sinceExclusive
			: lookbackFloor;

	const [row] = await db
		.select({ id: chatSessions.id })
		.from(chatSessions)
		.where(
			and(
				eq(chatSessions.organizationId, organizationId),
				eq(chatSessions.createdBy, userId),
				lt(chatSessions.lastActiveAt, idleBefore),
				gt(chatSessions.lastActiveAt, floor),
			),
		)
		.limit(1);
	return Boolean(row);
}

/** Load this user's approved memories (capped) for the nudge context. */
async function loadApprovedMemories(
	organizationId: string,
	userId: string,
): Promise<AmbientMemoryItem[]> {
	const rows = await db
		.select({ category: memoryItems.category, body: memoryItems.body })
		.from(memoryItems)
		.where(
			and(
				eq(memoryItems.organizationId, organizationId),
				eq(memoryItems.createdBy, userId),
				eq(memoryItems.status, "approved"),
			),
		)
		.orderBy(desc(memoryItems.updatedAt))
		.limit(MAX_MEMORY_ITEMS);
	return rows.map((r) => ({
		category: r.category as AmbientMemoryCategory,
		body: r.body,
	}));
}

/** Load this user's recent journal events (capped) for the nudge context. */
async function loadRecentEvents(
	organizationId: string,
	userId: string,
): Promise<AmbientJournalEvent[]> {
	const rows = await db
		.select({
			title: journalEvents.title,
			summary: journalEvents.summary,
			createdAt: journalEvents.createdAt,
		})
		.from(journalEvents)
		.where(
			and(
				eq(journalEvents.organizationId, organizationId),
				eq(journalEvents.createdBy, userId),
			),
		)
		.orderBy(desc(journalEvents.createdAt))
		.limit(MAX_EVENTS);
	return rows;
}

/**
 * Ask the cheap house model for one nudge. Returns `null` when R1 is
 * unconfigured, there is no context to reason over, or the model chose silence;
 * swallows model/parse errors (logged) so one bad user never fails the tick.
 */
export async function generateNudge(args: {
	memories: readonly AmbientMemoryItem[];
	events: readonly AmbientJournalEvent[];
	persona?: string | null;
}): Promise<AmbientNudge | null> {
	if (!isR1Configured()) return null;
	const context = buildNudgeContext(args);
	if (!context) return null;
	try {
		const raw = await callR1Json<{ nudge?: unknown }>(
			[
				{ role: "system", content: AMBIENT_NUDGE_SYSTEM_PROMPT },
				{ role: "user", content: context },
			],
			{ temperature: 0.3, maxTokens: 512 },
		);
		return sanitizeNudge(raw?.nudge);
	} catch (error) {
		console.error(
			"[ambient/nudge] generation failed",
			String(error).slice(0, 300),
		);
		return null;
	}
}

/** Write one nudge into the journal event lane (kind='ambient_nudge'). */
async function writeNudgeEvent(args: {
	organizationId: string;
	userId: string;
	nudge: AmbientNudge;
}): Promise<void> {
	await dbWs.insert(journalEvents).values({
		organizationId: args.organizationId,
		createdBy: args.userId,
		// No source automation/run — ambient nudges are not automation-produced.
		automationId: null,
		automationRunId: null,
		kind: AMBIENT_NUDGE_KIND,
		title: args.nudge.title,
		summary: args.nudge.body,
		payload: { source: "ambient" },
	});
}

/**
 * One reconcile pass: emit at most one proactive nudge per opted-in user. Safe
 * to call on a `*\/5 * * * *` schedule. A full no-op when R1 is unconfigured;
 * per-user it no-ops unless the user opted in, is under the hourly cap, and has
 * a fresh idle-session signal — so cost is bounded by construction.
 */
export async function runAmbientNudges(
	now: Date = new Date(),
): Promise<RunAmbientResult> {
	if (!isR1Configured()) {
		return {
			considered: 0,
			rateLimited: 0,
			noSignal: 0,
			suppressed: 0,
			nudged: 0,
			skippedUnconfigured: true,
		};
	}

	const users = await findEnabledUsers();

	let rateLimited = 0;
	let noSignal = 0;
	let suppressed = 0;
	let nudged = 0;

	for (const user of users) {
		const { organizationId, createdBy: userId } = user;

		// Cap 1: global per-user hourly limit.
		const recent = await recentNudgeCount(organizationId, userId, now);
		if (recent >= MAX_NUDGES_PER_HOUR) {
			rateLimited += 1;
			continue;
		}

		// Trigger: only nudge on a session that went idle since the last nudge.
		const since = await lastNudgeAt(organizationId, userId);
		const hasSignal = await hasFreshIdleSession(
			organizationId,
			userId,
			now,
			since,
		);
		if (!hasSignal) {
			noSignal += 1;
			continue;
		}

		const [memories, events] = await Promise.all([
			loadApprovedMemories(organizationId, userId),
			loadRecentEvents(organizationId, userId),
		]);

		const nudge = await generateNudge({
			memories,
			events,
			persona: user.voiceAgentContext,
		});
		if (!nudge) {
			suppressed += 1;
			continue;
		}

		await writeNudgeEvent({ organizationId, userId, nudge });
		nudged += 1;
	}

	return {
		considered: users.length,
		rateLimited,
		noSignal,
		suppressed,
		nudged,
	};
}
