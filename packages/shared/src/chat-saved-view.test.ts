import { describe, expect, it } from "bun:test";

import {
	EMPTY_SAVED_VIEW_RULE,
	getSmartFolder,
	ruleIsServerComplete,
	SMART_FOLDERS,
	savedViewRuleSchema,
	savedViewRuleToListInput,
	sessionMatchesRule,
	smartFolderClientPredicate,
} from "./chat-saved-view";

describe("savedViewRuleSchema", () => {
	it("accepts the empty rule", () => {
		expect(savedViewRuleSchema.parse({})).toEqual({});
	});

	it("accepts a full boolean rule", () => {
		const parsed = savedViewRuleSchema.parse({
			labelsAll: ["a"],
			labelsAny: ["b", "c"],
			labelsNone: ["d"],
			untagged: false,
			status: "active",
		});
		expect(parsed.labelsAny).toEqual(["b", "c"]);
		expect(parsed.status).toBe("active");
	});

	it("rejects unknown keys (strict)", () => {
		expect(() => savedViewRuleSchema.parse({ labelsMaybe: ["a"] })).toThrow();
	});

	it("rejects an empty label array (min 1)", () => {
		expect(() => savedViewRuleSchema.parse({ labelsAny: [] })).toThrow();
	});

	it("rejects an unknown status", () => {
		expect(() => savedViewRuleSchema.parse({ status: "deleted" })).toThrow();
	});
});

describe("savedViewRuleToListInput", () => {
	it("maps every label axis + status", () => {
		expect(
			savedViewRuleToListInput({
				labelsAll: ["a"],
				labelsAny: ["b"],
				labelsNone: ["c"],
				status: "archived",
			}),
		).toEqual({
			labelsAll: ["a"],
			labelsAny: ["b"],
			labelsNone: ["c"],
			status: "archived",
		});
	});

	it("yields {} for the empty rule (unfiltered)", () => {
		expect(savedViewRuleToListInput(EMPTY_SAVED_VIEW_RULE)).toEqual({});
	});

	it("omits the untagged axis (no server param)", () => {
		expect(savedViewRuleToListInput({ untagged: true })).toEqual({});
	});
});

describe("ruleIsServerComplete", () => {
	it("is false only when untagged is set", () => {
		expect(ruleIsServerComplete({ labelsAny: ["a"] })).toBe(true);
		expect(ruleIsServerComplete({ untagged: true })).toBe(false);
	});
});

describe("sessionMatchesRule", () => {
	it("empty rule matches everything", () => {
		expect(sessionMatchesRule({}, { labels: ["x"] })).toBe(true);
		expect(sessionMatchesRule({}, { labels: [] })).toBe(true);
	});

	it("untagged keeps only label-less sessions", () => {
		expect(sessionMatchesRule({ untagged: true }, { labels: [] })).toBe(true);
		expect(sessionMatchesRule({ untagged: true }, { labels: ["x"] })).toBe(
			false,
		);
	});

	it("labelsAll requires every name (AND)", () => {
		const rule = { labelsAll: ["a", "b"] };
		expect(sessionMatchesRule(rule, { labels: ["a", "b", "c"] })).toBe(true);
		expect(sessionMatchesRule(rule, { labels: ["a"] })).toBe(false);
	});

	it("labelsAny requires at least one name (OR)", () => {
		const rule = { labelsAny: ["a", "b"] };
		expect(sessionMatchesRule(rule, { labels: ["b"] })).toBe(true);
		expect(sessionMatchesRule(rule, { labels: ["z"] })).toBe(false);
	});

	it("labelsNone excludes any listed name (NOT)", () => {
		const rule = { labelsNone: ["spam"] };
		expect(sessionMatchesRule(rule, { labels: ["ok"] })).toBe(true);
		expect(sessionMatchesRule(rule, { labels: ["spam"] })).toBe(false);
	});

	it("status facet constrains lifecycle", () => {
		const rule = { status: "archived" as const };
		expect(sessionMatchesRule(rule, { labels: [], status: "archived" })).toBe(
			true,
		);
		expect(sessionMatchesRule(rule, { labels: [], status: "active" })).toBe(
			false,
		);
	});

	it("AND-composes the axes together", () => {
		const rule = { labelsAll: ["a"], labelsNone: ["b"] };
		expect(sessionMatchesRule(rule, { labels: ["a"] })).toBe(true);
		expect(sessionMatchesRule(rule, { labels: ["a", "b"] })).toBe(false);
	});
});

describe("SMART_FOLDERS", () => {
	it("exposes Untagged as the only server-complete preset", () => {
		const untagged = getSmartFolder("untagged");
		expect(untagged?.serverComplete).toBe(true);
		expect(untagged?.rule).toEqual({ untagged: true });
		const others = SMART_FOLDERS.filter((f) => f.id !== "untagged");
		expect(others.every((f) => f.serverComplete === false)).toBe(true);
	});

	it("has stable, unique ids", () => {
		const ids = SMART_FOLDERS.map((f) => f.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("smartFolderClientPredicate", () => {
	it("has-errors matches only error sessions", () => {
		expect(smartFolderClientPredicate("has-errors", { hasErrors: true })).toBe(
			true,
		);
		expect(smartFolderClientPredicate("has-errors", {})).toBe(false);
	});

	it("cli matches cli / claude-code sources", () => {
		expect(smartFolderClientPredicate("cli", { source: "cli" })).toBe(true);
		expect(smartFolderClientPredicate("cli", { source: "claude-code" })).toBe(
			true,
		);
		expect(smartFolderClientPredicate("cli", { source: "telegram" })).toBe(
			false,
		);
	});

	it("touched-today is calendar-day relative to injected now", () => {
		const now = new Date("2026-06-25T12:00:00Z").getTime();
		const earlierToday = new Date("2026-06-25T01:00:00Z").getTime();
		const yesterday = new Date("2026-06-24T23:00:00Z").getTime();
		expect(
			smartFolderClientPredicate(
				"touched-today",
				{ lastActiveAtMs: earlierToday },
				{ nowMs: now },
			),
		).toBe(true);
		expect(
			smartFolderClientPredicate(
				"touched-today",
				{ lastActiveAtMs: yesterday },
				{ nowMs: now },
			),
		).toBe(false);
	});

	it("me matches the viewing user's sessions", () => {
		expect(
			smartFolderClientPredicate(
				"me",
				{ createdBy: "u1" },
				{ currentUserId: "u1" },
			),
		).toBe(true);
		expect(
			smartFolderClientPredicate(
				"me",
				{ createdBy: "u2" },
				{ currentUserId: "u1" },
			),
		).toBe(false);
	});
});
