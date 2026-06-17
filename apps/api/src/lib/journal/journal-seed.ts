/**
 * GitHub-profile journal seed — pure transforms (journal-memory epic).
 *
 * Builds the R1 prompt for a NEW user's first ("welcome") journal entry from
 * their GitHub profile, used when there are no chat sessions to summarize yet.
 * Deliberately free of any `@rox/db/client` import so it can be unit-tested
 * without a database; the db orchestration lives in `journal-generation.ts`.
 */

import type { R1Message } from "../r1";
import { type JournalStreams, sanitizeStreams } from "./journal-streams";

/** Max repos / PRs pulled into the seed prompt (keeps the prompt bounded). */
export const MAX_SEED_REPOS = 10;
export const MAX_SEED_PRS = 20;

export interface GithubProfileRepo {
	fullName: string;
	isPrivate: boolean;
	defaultBranch: string;
}

export interface GithubProfilePr {
	title: string;
	state: string;
	headBranch: string;
}

export interface GithubProfileSummary {
	login: string;
	/** "User" | "Organization" (GitHub account type). */
	accountType: string;
	repos: GithubProfileRepo[];
	recentPrs: GithubProfilePr[];
}

export const JOURNAL_SEED_SYSTEM_PROMPT = `Ты — рефлексивный ассистент Rox. Это ПЕРВАЯ, приветственная запись в журнале нового пользователя. У тебя ещё нет его рабочих сессий — есть только профиль GitHub (логин, репозитории, недавние pull request'ы). На их основе сделай тёплую вводную запись на русском языке из ЧЕТЫРЁХ потоков.

Верни СТРОГО JSON-объект без markdown и без текста вне JSON, по схеме:
{
  "reflection": "тёплое приветствие в 2–4 предложениях: чем человек, судя по GitHub, занимается, какой стек/проекты в фокусе",
  "learnings": [{ "text": "наблюдение о проектах или активности пользователя" }],
  "memorySuggestions": [{ "body": "факт, достойный запоминания (проект, стек, роль)", "category": "projects|identity|instructions|career|general" }],
  "tips": [{ "text": "совет, как извлечь максимум из Rox для его задач" }]
}

Правила:
- Пиши тепло и кратко, по-русски. Это знакомство, а не сухой отчёт.
- category выбирай строго из: projects, identity, instructions, career, general.
- Опирайся ТОЛЬКО на предоставленные данные GitHub. Не выдумывай репозиториев, фактов или технологий.
- Если данных мало — сделай общее, но искреннее приветствие; пустые потоки верни пустыми массивами, но reflection заполни всегда.
- Верни ТОЛЬКО JSON.`;

/** Render a GitHub profile summary as a compact, deterministic Russian block. */
export function renderGithubProfileSummary(
	summary: GithubProfileSummary,
): string {
	const accountKind =
		summary.accountType === "Organization" ? "организация" : "пользователь";
	const lines: string[] = [
		`Профиль GitHub: @${summary.login} (${accountKind}).`,
	];

	if (summary.repos.length > 0) {
		lines.push(`Репозитории (${summary.repos.length}):`);
		for (const repo of summary.repos) {
			const visibility = repo.isPrivate ? "приватный" : "публичный";
			lines.push(
				`- ${repo.fullName} (${visibility}, ветка по умолчанию: ${repo.defaultBranch})`,
			);
		}
	} else {
		lines.push("Репозитории: пока не синхронизированы.");
	}

	if (summary.recentPrs.length > 0) {
		lines.push(`Недавние pull request'ы (${summary.recentPrs.length}):`);
		for (const pr of summary.recentPrs) {
			lines.push(`- [${pr.state}] ${pr.title} (ветка ${pr.headBranch})`);
		}
	} else {
		lines.push("Pull request'ы: пока нет.");
	}

	return lines.join("\n");
}

/** Pair the seed system prompt with the rendered GitHub summary for R1. */
export function buildSeedMessages(summary: GithubProfileSummary): R1Message[] {
	return [
		{ role: "system", content: JOURNAL_SEED_SYSTEM_PROMPT },
		{ role: "user", content: renderGithubProfileSummary(summary) },
	];
}

/**
 * Shape a raw R1 reply into the same {@link JournalStreams} contract a real
 * daily entry uses, so a seed row is indistinguishable downstream.
 */
export function shapeSeedStreams(
	raw: Partial<JournalStreams> | null,
): JournalStreams {
	return sanitizeStreams(raw);
}
