import { describe, expect, test } from "bun:test";

import {
	checkItemSchema,
	EXECUTION_MODES,
	EXTERNAL_APPS,
	FILE_OPEN_MODES,
	gitHubStatusSchema,
	gitStatusSchema,
	NON_EDITOR_APPS,
	normalizeExecutionMode,
	pullRequestCommentSchema,
	TERMINAL_LINK_BEHAVIORS,
	terminalPresetSchema,
	workspaceTypeSchema,
} from "./zod";

describe("normalizeExecutionMode", () => {
	test.each([...EXECUTION_MODES])("passes through valid mode %s", (mode) => {
		expect(normalizeExecutionMode(mode)).toBe(mode);
	});

	test("maps legacy 'parallel' to 'split-pane'", () => {
		expect(normalizeExecutionMode("parallel")).toBe("split-pane");
	});

	const unknownInputs: Array<[label: string, input: unknown]> = [
		["undefined", undefined],
		["null", null],
		["empty string", ""],
		["bogus string", "bogus"],
		["number", 42],
		["object", {}],
		["array", []],
	];
	test.each(
		unknownInputs,
	)("falls back to 'new-tab' for unknown input (%s)", (_label, input) => {
		expect(normalizeExecutionMode(input)).toBe("new-tab");
	});
});

describe("gitStatusSchema", () => {
	test("accepts a minimal valid git status", () => {
		const parsed = gitStatusSchema.parse({
			branch: "main",
			needsRebase: false,
			lastRefreshed: 123,
		});
		expect(parsed.branch).toBe("main");
		expect(parsed.ahead).toBeUndefined();
	});

	test("rejects a status missing required fields", () => {
		expect(gitStatusSchema.safeParse({ branch: "main" }).success).toBe(false);
	});

	test("preserves optional ahead/behind counters", () => {
		const parsed = gitStatusSchema.parse({
			branch: "feat",
			needsRebase: true,
			ahead: 2,
			behind: 1,
			lastRefreshed: 0,
		});
		expect(parsed.ahead).toBe(2);
		expect(parsed.behind).toBe(1);
	});
});

describe("checkItemSchema", () => {
	test("accepts known check statuses", () => {
		expect(
			checkItemSchema.safeParse({ name: "ci", status: "success" }).success,
		).toBe(true);
	});

	test("rejects an unknown status", () => {
		expect(
			checkItemSchema.safeParse({ name: "ci", status: "exploded" }).success,
		).toBe(false);
	});
});

describe("pullRequestCommentSchema", () => {
	test("requires id, authorLogin and body", () => {
		expect(
			pullRequestCommentSchema.safeParse({
				id: "c1",
				authorLogin: "octocat",
				body: "lgtm",
			}).success,
		).toBe(true);
		expect(
			pullRequestCommentSchema.safeParse({ id: "c1", body: "lgtm" }).success,
		).toBe(false);
	});

	test("rejects an out-of-range kind", () => {
		expect(
			pullRequestCommentSchema.safeParse({
				id: "c1",
				authorLogin: "octocat",
				body: "lgtm",
				kind: "spam",
			}).success,
		).toBe(false);
	});
});

describe("gitHubStatusSchema", () => {
	test("accepts a null PR with required repo fields", () => {
		const parsed = gitHubStatusSchema.parse({
			pr: null,
			repoUrl: "https://example.test/repo",
			branchExistsOnRemote: false,
			lastRefreshed: 0,
		});
		expect(parsed.pr).toBeNull();
	});

	test("accepts a fully populated PR", () => {
		const result = gitHubStatusSchema.safeParse({
			pr: {
				number: 7,
				title: "Add tests",
				url: "https://example.test/pr/7",
				state: "open",
				additions: 10,
				deletions: 2,
				reviewDecision: "approved",
				checksStatus: "success",
				checks: [{ name: "ci", status: "success" }],
			},
			repoUrl: "https://example.test/repo",
			branchExistsOnRemote: true,
			lastRefreshed: 1,
		});
		expect(result.success).toBe(true);
	});

	test("rejects an invalid PR state", () => {
		const result = gitHubStatusSchema.safeParse({
			pr: {
				number: 7,
				title: "x",
				url: "u",
				state: "reopened",
				additions: 0,
				deletions: 0,
				reviewDecision: "approved",
				checksStatus: "success",
				checks: [],
			},
			repoUrl: "u",
			branchExistsOnRemote: true,
			lastRefreshed: 1,
		});
		expect(result.success).toBe(false);
	});
});

describe("terminalPresetSchema", () => {
	test("accepts a preset with commands and an execution mode", () => {
		const parsed = terminalPresetSchema.parse({
			id: "p1",
			name: "Dev",
			cwd: "/repo",
			commands: ["bun dev"],
			executionMode: "split-pane",
		});
		expect(parsed.commands).toEqual(["bun dev"]);
	});

	test("rejects an execution mode outside EXECUTION_MODES", () => {
		expect(
			terminalPresetSchema.safeParse({
				id: "p1",
				name: "Dev",
				cwd: "/repo",
				commands: [],
				executionMode: "parallel",
			}).success,
		).toBe(false);
	});
});

describe("enum constants", () => {
	test("workspaceTypeSchema only accepts worktree/branch", () => {
		expect(workspaceTypeSchema.safeParse("worktree").success).toBe(true);
		expect(workspaceTypeSchema.safeParse("branch").success).toBe(true);
		expect(workspaceTypeSchema.safeParse("ephemeral").success).toBe(false);
	});

	test("NON_EDITOR_APPS is a subset of EXTERNAL_APPS", () => {
		for (const app of NON_EDITOR_APPS) {
			expect(EXTERNAL_APPS).toContain(app);
		}
	});

	test("EXTERNAL_APPS has no duplicate entries", () => {
		expect(new Set(EXTERNAL_APPS).size).toBe(EXTERNAL_APPS.length);
	});

	test("FILE_OPEN_MODES and TERMINAL_LINK_BEHAVIORS are non-empty", () => {
		expect(FILE_OPEN_MODES.length).toBeGreaterThan(0);
		expect(TERMINAL_LINK_BEHAVIORS.length).toBeGreaterThan(0);
	});
});
