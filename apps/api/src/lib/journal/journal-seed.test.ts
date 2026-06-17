import { describe, expect, it } from "bun:test";
import {
	buildSeedMessages,
	type GithubProfileSummary,
	JOURNAL_SEED_SYSTEM_PROMPT,
	MAX_SEED_PRS,
	MAX_SEED_REPOS,
	renderGithubProfileSummary,
	shapeSeedStreams,
} from "./journal-seed";

const summary: GithubProfileSummary = {
	login: "octocat",
	accountType: "User",
	repos: [
		{ fullName: "octocat/hello", isPrivate: false, defaultBranch: "main" },
		{ fullName: "octocat/secret", isPrivate: true, defaultBranch: "dev" },
	],
	recentPrs: [{ title: "Add login", state: "open", headBranch: "feat/login" }],
};

describe("renderGithubProfileSummary", () => {
	it("includes login, repos and PRs", () => {
		const text = renderGithubProfileSummary(summary);
		expect(text).toContain("octocat");
		expect(text).toContain("octocat/hello");
		expect(text).toContain("octocat/secret");
		expect(text).toContain("приватный");
		expect(text).toContain("Add login");
	});

	it("renders empty-state lines when there is no activity", () => {
		const text = renderGithubProfileSummary({
			login: "newbie",
			accountType: "User",
			repos: [],
			recentPrs: [],
		});
		expect(text).toContain("newbie");
		expect(text).toContain("пока не синхронизированы");
		expect(text).toContain("Pull request'ы: пока нет");
	});
});

describe("buildSeedMessages", () => {
	it("pairs the seed system prompt with the rendered summary", () => {
		const messages = buildSeedMessages(summary);
		expect(messages).toHaveLength(2);
		expect(messages[0]).toEqual({
			role: "system",
			content: JOURNAL_SEED_SYSTEM_PROMPT,
		});
		expect(messages[1]?.role).toBe("user");
		expect(messages[1]?.content).toContain("octocat");
	});
});

describe("JOURNAL_SEED_SYSTEM_PROMPT", () => {
	it("asks for strict JSON in Russian with the category enum", () => {
		expect(JOURNAL_SEED_SYSTEM_PROMPT).toContain("JSON");
		expect(JOURNAL_SEED_SYSTEM_PROMPT).toContain("reflection");
		expect(JOURNAL_SEED_SYSTEM_PROMPT).toContain("projects");
		expect(JOURNAL_SEED_SYSTEM_PROMPT).toContain("русском");
	});
});

describe("shapeSeedStreams", () => {
	it("coerces unknown categories and drops empty entries", () => {
		const shaped = shapeSeedStreams({
			reflection: "  привет  ",
			learnings: [{ text: "вывод" }, { text: "  " }],
			memorySuggestions: [{ body: "факт", category: "bogus" }],
			tips: [],
		} as never);
		expect(shaped.reflection).toBe("привет");
		expect(shaped.learnings).toHaveLength(1);
		expect(shaped.memorySuggestions[0]?.category).toBe("general");
	});

	it("tolerates null", () => {
		const shaped = shapeSeedStreams(null);
		expect(shaped.reflection).toBe("");
		expect(shaped.learnings).toEqual([]);
		expect(shaped.memorySuggestions).toEqual([]);
	});

	it("keeps the seed bounds sane", () => {
		expect(MAX_SEED_REPOS).toBe(10);
		expect(MAX_SEED_PRS).toBe(20);
	});
});
