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
 * transforms live in `journal-streams.ts` (db-free, unit-tested).
 */

import { db } from "@rox/db/client";
import {
	chatSessions,
	githubInstallations,
	githubPullRequests,
	githubRepositories,
	type JournalMemorySuggestion,
	journalEntries,
	memoryItems,
} from "@rox/db/schema";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { callR1Json, isR1Configured, type R1Message } from "../r1";
import { readSessionTranscript } from "../session-transcript";
import {
	buildSeedMessages,
	type GithubProfilePr,
	type GithubProfileRepo,
	type GithubProfileSummary,
	MAX_SEED_PRS,
	MAX_SEED_REPOS,
	shapeSeedStreams,
} from "./journal-seed";
import {
	dayBounds,
	JOURNAL_SYSTEM_PROMPT,
	type JournalStreams,
	MAX_SESSIONS_PER_DAY,
	MAX_TRANSCRIPT_CHARS_PER_SESSION,
	sanitizeStreams,
} from "./journal-streams";

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

	const [entry] = await db
		.insert(journalEntries)
		.values({
			organizationId,
			createdBy: userId,
			day,
			reflection: streams.reflection || null,
			learnings: streams.learnings,
			memorySuggestions: streams.memorySuggestions,
			tips: streams.tips,
			status: "generated",
			modelId: "rox-r1",
			sourceSessionIds: usedSessionIds,
			generatedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: [
				journalEntries.organizationId,
				journalEntries.createdBy,
				journalEntries.day,
			],
			set: {
				reflection: streams.reflection || null,
				learnings: streams.learnings,
				memorySuggestions: streams.memorySuggestions,
				tips: streams.tips,
				status: "generated",
				modelId: "rox-r1",
				sourceSessionIds: usedSessionIds,
				generatedAt: new Date(),
				updatedAt: new Date(),
			},
		})
		.returning({ id: journalEntries.id });

	const memoryCount = await materializeMemorySuggestions({
		organizationId,
		userId,
		day,
		suggestions: streams.memorySuggestions,
	});

	return {
		status: "generated",
		entryId: entry?.id ?? "",
		sessionCount: usedSessionIds.length,
		memoryCount,
	};
}

/**
 * Insert journal memory suggestions as `memory_items` (source=agent,
 * status=suggested), skipping bodies the user already has in the same category
 * (any status) so re-generation doesn't pile up duplicates.
 */
async function materializeMemorySuggestions(args: {
	organizationId: string;
	userId: string;
	day: string;
	suggestions: JournalMemorySuggestion[];
}): Promise<number> {
	const { organizationId, userId, day, suggestions } = args;
	if (suggestions.length === 0) return 0;

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

	const fresh = suggestions.filter(
		(s) => !seen.has(`${s.category}::${s.body.trim().toLowerCase()}`),
	);
	if (fresh.length === 0) return 0;

	await db.insert(memoryItems).values(
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

// ---------------------------------------------------------------------------
// GitHub-seeded first journal entry (journal-memory epic).
//
// When a brand-new user has no chat sessions for the day and no journal entry
// yet, seed a warm onboarding entry from their GitHub profile so the Журнал
// isn't empty on day one. The seed is marked via `SEED_SOURCE_MARKER` so a
// later real daily digest still regenerates the same (org, user, day) row.
// ---------------------------------------------------------------------------

/** Sentinel stored in `sourceSessionIds` to mark a GitHub-seed entry. */
export const SEED_SOURCE_MARKER = "seed:github";

/** True when a journal entry was produced by the GitHub seed (not real sessions). */
export function isSeedEntry(
	sourceSessionIds: readonly string[] | null | undefined,
): boolean {
	return (
		Array.isArray(sourceSessionIds) &&
		sourceSessionIds.includes(SEED_SOURCE_MARKER)
	);
}

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
 * Build a compact GitHub profile summary for an org from already-synced data
 * (the GitHub App keeps `github_repositories` / `github_pull_requests` fresh),
 * so the seed needs no live Octokit call. Returns `null` when the org has no
 * GitHub installation.
 */
async function buildGithubProfileSummary(
	organizationId: string,
): Promise<GithubProfileSummary | null> {
	const [installation] = await db
		.select({
			accountLogin: githubInstallations.accountLogin,
			accountType: githubInstallations.accountType,
		})
		.from(githubInstallations)
		.where(eq(githubInstallations.organizationId, organizationId))
		.limit(1);
	if (!installation) return null;

	const repoRows = await db
		.select({
			fullName: githubRepositories.fullName,
			isPrivate: githubRepositories.isPrivate,
			defaultBranch: githubRepositories.defaultBranch,
		})
		.from(githubRepositories)
		.where(eq(githubRepositories.organizationId, organizationId))
		.limit(MAX_SEED_REPOS);

	const prRows = await db
		.select({
			title: githubPullRequests.title,
			state: githubPullRequests.state,
			headBranch: githubPullRequests.headBranch,
		})
		.from(githubPullRequests)
		.where(eq(githubPullRequests.organizationId, organizationId))
		.orderBy(desc(githubPullRequests.updatedAt))
		.limit(MAX_SEED_PRS);

	const repos: GithubProfileRepo[] = repoRows.map((r) => ({
		fullName: r.fullName,
		isPrivate: r.isPrivate,
		defaultBranch: r.defaultBranch,
	}));
	const recentPrs: GithubProfilePr[] = prRows.map((p) => ({
		title: p.title,
		state: p.state,
		headBranch: p.headBranch,
	}));

	return {
		login: installation.accountLogin,
		accountType: installation.accountType,
		repos,
		recentPrs,
	};
}

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

	const [entry] = await db
		.insert(journalEntries)
		.values({
			organizationId,
			createdBy: userId,
			day,
			reflection: streams.reflection || null,
			learnings: streams.learnings,
			memorySuggestions: streams.memorySuggestions,
			tips: streams.tips,
			status: "generated",
			modelId: "rox-r1",
			sourceSessionIds: [SEED_SOURCE_MARKER],
			generatedAt: new Date(),
		})
		// Do NOT clobber a concurrently-created entry — a race means the digest
		// (or another seed) won the day; treat it as an existing entry.
		.onConflictDoNothing({
			target: [
				journalEntries.organizationId,
				journalEntries.createdBy,
				journalEntries.day,
			],
		})
		.returning({ id: journalEntries.id });
	if (!entry) return { status: "skipped", reason: "has-entry" };

	const memoryCount = await materializeMemorySuggestions({
		organizationId,
		userId,
		day,
		suggestions: streams.memorySuggestions,
	});

	return {
		status: "seeded",
		entryId: entry.id,
		repoCount: summary.repos.length,
		prCount: summary.recentPrs.length,
		memoryCount,
	};
}
