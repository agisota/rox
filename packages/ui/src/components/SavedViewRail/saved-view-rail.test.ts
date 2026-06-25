import { describe, expect, it } from "bun:test";

import {
	chipMode,
	chipSelectionToRule,
	countMatchingSessions,
	cycleChipMode,
	deriveRailChips,
	deriveSmartFolders,
	EMPTY_CHIP_SELECTION,
	type RailLabel,
	railLabelColor,
	ruleToChipSelection,
	toggleChip,
} from "./saved-view-rail";

const BUG: RailLabel = { id: "a", name: "Bug", color: "hsl(10, 58%, 46%)" };
const IDEA: RailLabel = { id: "b", name: "Idea" }; // no colour → auto-colour
const LABELS: RailLabel[] = [BUG, IDEA];

describe("railLabelColor", () => {
	it("uses the explicit colour, else a deterministic auto-colour", () => {
		expect(railLabelColor(BUG)).toBe("hsl(10, 58%, 46%)");
		expect(railLabelColor(IDEA)).toMatch(/^hsl\(/);
		expect(railLabelColor(IDEA)).toBe(
			railLabelColor({ id: "b", name: "Idea" }),
		);
	});
});

describe("cycleChipMode / toggleChip", () => {
	it("cycles off → any → all → none → off", () => {
		expect(cycleChipMode("off")).toBe("any");
		expect(cycleChipMode("any")).toBe("all");
		expect(cycleChipMode("all")).toBe("none");
		expect(cycleChipMode("none")).toBe("off");
	});

	it("toggling sets then clears the key", () => {
		let sel = toggleChip(EMPTY_CHIP_SELECTION, "Bug");
		expect(chipMode(sel, "Bug")).toBe("any");
		sel = toggleChip(sel, "Bug"); // all
		sel = toggleChip(sel, "Bug"); // none
		expect(chipMode(sel, "Bug")).toBe("none");
		sel = toggleChip(sel, "Bug"); // off → key removed
		expect(sel).toEqual({});
	});

	it("does not mutate the input selection", () => {
		const base = { Bug: "any" as const };
		const next = toggleChip(base, "Idea");
		expect(base).toEqual({ Bug: "any" });
		expect(next.Idea).toBe("any");
	});
});

describe("chipSelectionToRule / ruleToChipSelection", () => {
	it("groups chips onto the AND/OR/NOT axes", () => {
		const rule = chipSelectionToRule({
			Bug: "all",
			Idea: "any",
			Spam: "none",
		});
		expect(rule).toEqual({
			labelsAll: ["Bug"],
			labelsAny: ["Idea"],
			labelsNone: ["Spam"],
		});
	});

	it("empty selection → empty rule", () => {
		expect(chipSelectionToRule({})).toEqual({});
	});

	it("round-trips through ruleToChipSelection", () => {
		const sel = {
			Bug: "all" as const,
			Idea: "any" as const,
			X: "none" as const,
		};
		expect(ruleToChipSelection(chipSelectionToRule(sel))).toEqual(sel);
	});
});

describe("deriveRailChips", () => {
	it("derives one chip per label with its mode + colour", () => {
		const chips = deriveRailChips(LABELS, { Bug: "none" });
		expect(chips).toHaveLength(2);
		expect(chips[0]?.name).toBe("Bug");
		expect(chips[0]?.mode).toBe("none");
		expect(chips[1]?.mode).toBe("off");
		expect(chips[0]?.color).toBe("hsl(10, 58%, 46%)");
	});
});

describe("countMatchingSessions (live counter)", () => {
	const sessions = [
		{ labels: ["Bug"] },
		{ labels: ["Idea"] },
		{ labels: [] },
		{ labels: ["Bug", "Idea"] },
	];

	it("counts by the NOT axis", () => {
		const rule = chipSelectionToRule({ Bug: "none" });
		expect(countMatchingSessions(rule, sessions)).toBe(2); // Idea-only + untagged
	});

	it("counts by the AND axis", () => {
		const rule = chipSelectionToRule({ Bug: "all", Idea: "all" });
		expect(countMatchingSessions(rule, sessions)).toBe(1);
	});

	it("empty rule counts every session", () => {
		expect(countMatchingSessions({}, sessions)).toBe(4);
	});
});

describe("deriveSmartFolders", () => {
	it("counts the server-complete Untagged folder, leaves others at 0", () => {
		const folders = deriveSmartFolders([
			{ labels: [] },
			{ labels: ["x"] },
			{ labels: [] },
		]);
		const untagged = folders.find((f) => f.id === "untagged");
		expect(untagged?.count).toBe(2);
		const cli = folders.find((f) => f.id === "cli");
		expect(cli?.count).toBe(0);
	});
});
