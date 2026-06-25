import { describe, expect, it } from "bun:test";

import {
	deriveLabelDots,
	deriveSourceChips,
	hasWorktreeMeta,
	LABEL_DOT_CAP,
	type SessionRowData,
	type SessionRowLabel,
	showsForkBadge,
	sourceLabel,
} from "./session-row";

const BUG: SessionRowLabel = { name: "Bug", color: "hsl(10, 58%, 46%)" };
const IDEA: SessionRowLabel = { name: "Idea", color: "hsl(200, 58%, 46%)" };
const DOCS: SessionRowLabel = { name: "Docs", color: "hsl(90, 58%, 46%)" };
const CHORE: SessionRowLabel = { name: "Chore", color: "hsl(300, 58%, 46%)" };

describe("deriveSourceChips", () => {
	it("returns no chips for absent or empty sources", () => {
		expect(deriveSourceChips(undefined)).toEqual([]);
		expect(deriveSourceChips([])).toEqual([]);
	});

	it("preserves order and resolves labels", () => {
		const chips = deriveSourceChips(["cli", "claude-code", "telegram"]);
		expect(chips.map((c) => c.source)).toEqual([
			"cli",
			"claude-code",
			"telegram",
		]);
		expect(chips.map((c) => c.label)).toEqual([
			"CLI",
			"Claude Code",
			"Telegram",
		]);
	});

	it("de-duplicates repeated sources", () => {
		const chips = deriveSourceChips(["slack", "slack", "discord"]);
		expect(chips.map((c) => c.source)).toEqual(["slack", "discord"]);
	});
});

describe("sourceLabel", () => {
	it("maps each source to its visible label", () => {
		expect(sourceLabel("cli")).toBe("CLI");
		expect(sourceLabel("claude-code")).toBe("Claude Code");
		expect(sourceLabel("discord")).toBe("Discord");
		expect(sourceLabel("slack")).toBe("Slack");
	});
});

describe("deriveLabelDots", () => {
	it("returns empty layout for no labels", () => {
		expect(deriveLabelDots(undefined)).toEqual({ dots: [], overflow: 0 });
		expect(deriveLabelDots([])).toEqual({ dots: [], overflow: 0 });
	});

	it("shows all dots when within the cap", () => {
		const { dots, overflow } = deriveLabelDots([BUG, IDEA]);
		expect(dots).toEqual([BUG, IDEA]);
		expect(overflow).toBe(0);
	});

	it("caps dots and counts the overflow", () => {
		const { dots, overflow } = deriveLabelDots([BUG, IDEA, DOCS, CHORE]);
		expect(dots).toHaveLength(LABEL_DOT_CAP);
		expect(overflow).toBe(1);
	});

	it("honours a custom cap", () => {
		const { dots, overflow } = deriveLabelDots([BUG, IDEA, DOCS], 1);
		expect(dots).toEqual([BUG]);
		expect(overflow).toBe(2);
	});
});

describe("showsForkBadge", () => {
	it("shows the badge only for a fork lineage", () => {
		expect(showsForkBadge(undefined)).toBe(false);
		expect(showsForkBadge({ kind: "root" })).toBe(false);
		expect(showsForkBadge({ kind: "fork" })).toBe(true);
	});
});

describe("hasWorktreeMeta", () => {
	const base: SessionRowData = {
		sessionId: "s1",
		title: "T",
		isCurrent: false,
	};

	it("is false when worktree and branch are absent or blank", () => {
		expect(hasWorktreeMeta(base)).toBe(false);
		expect(hasWorktreeMeta({ ...base, worktree: "  ", branch: "" })).toBe(
			false,
		);
	});

	it("is true when either worktree or branch has content", () => {
		expect(hasWorktreeMeta({ ...base, branch: "main" })).toBe(true);
		expect(hasWorktreeMeta({ ...base, worktree: "feature" })).toBe(true);
	});
});
