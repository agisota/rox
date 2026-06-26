import { describe, expect, it } from "bun:test";

import {
	ALL_TAGS_FILTER,
	deriveTagPills,
	isLabelActive,
	labelColor,
	sessionPassesFilter,
	type TagFilterState,
	type TagLabel,
	tagFilterToListInput,
	toggleLabel,
} from "./tag-filter";

const BUG: TagLabel = { id: "a", name: "Bug", color: "hsl(10, 58%, 46%)" };
const IDEA: TagLabel = { id: "b", name: "Idea" }; // no colour → auto-colour
const LABELS: TagLabel[] = [BUG, IDEA];

describe("labelColor", () => {
	it("uses the explicit colour when present", () => {
		expect(labelColor(BUG)).toBe("hsl(10, 58%, 46%)");
	});

	it("falls back to a deterministic auto-colour", () => {
		const first = labelColor(IDEA);
		const second = labelColor({ id: "b", name: "Idea" });
		expect(first).toBe(second);
		expect(first).toMatch(/^hsl\(/);
	});
});

describe("deriveTagPills", () => {
	it("derives All · Unassigned · one pill per label", () => {
		const pills = deriveTagPills(LABELS, ALL_TAGS_FILTER);
		expect(pills.map((pill) => pill.kind)).toEqual([
			"all",
			"unassigned",
			"label",
			"label",
		]);
		expect(pills.find((pill) => pill.kind === "all")?.active).toBe(true);
		expect(pills.find((pill) => pill.label === "Bug")?.color).toBe(
			"hsl(10, 58%, 46%)",
		);
	});

	it("marks the matching label pills active under a labels filter", () => {
		const filter: TagFilterState = { kind: "labels", names: ["Bug"] };
		const pills = deriveTagPills(LABELS, filter);
		expect(pills.find((pill) => pill.label === "Bug")?.active).toBe(true);
		expect(pills.find((pill) => pill.label === "Idea")?.active).toBe(false);
		expect(pills.find((pill) => pill.kind === "all")?.active).toBe(false);
	});

	it("marks Unassigned active under the unassigned filter", () => {
		const pills = deriveTagPills(LABELS, { kind: "unassigned" });
		expect(pills.find((pill) => pill.kind === "unassigned")?.active).toBe(true);
		expect(pills.find((pill) => pill.kind === "all")?.active).toBe(false);
	});

	it("passes a label's icon token through to its pill (F11)", () => {
		const flagged: TagLabel = { id: "c", name: "Flagged", icon: "🚩" };
		const pills = deriveTagPills([flagged], ALL_TAGS_FILTER);
		expect(pills.find((pill) => pill.label === "Flagged")?.icon).toBe("🚩");
		// Labels without an icon expose `null`, never `undefined`.
		expect(pills.find((pill) => pill.label === "Bug")).toBeUndefined();
		const noIcon = deriveTagPills([BUG], ALL_TAGS_FILTER);
		expect(noIcon.find((pill) => pill.kind === "label")?.icon).toBeNull();
	});
});

describe("toggleLabel", () => {
	it("starts a fresh labels set from all/unassigned", () => {
		expect(toggleLabel(ALL_TAGS_FILTER, "Bug")).toEqual({
			kind: "labels",
			names: ["Bug"],
		});
		expect(toggleLabel({ kind: "unassigned" }, "Bug")).toEqual({
			kind: "labels",
			names: ["Bug"],
		});
	});

	it("adds and removes within the labelsAny axis", () => {
		const one = toggleLabel(ALL_TAGS_FILTER, "Bug");
		const two = toggleLabel(one, "Idea");
		expect(two).toEqual({ kind: "labels", names: ["Bug", "Idea"] });
		expect(toggleLabel(two, "Bug")).toEqual({
			kind: "labels",
			names: ["Idea"],
		});
	});

	it("collapses back to all when the last label is toggled off", () => {
		const one = toggleLabel(ALL_TAGS_FILTER, "Bug");
		expect(toggleLabel(one, "Bug")).toEqual(ALL_TAGS_FILTER);
	});
});

describe("isLabelActive", () => {
	it("is true only for names in a labels filter", () => {
		expect(isLabelActive({ kind: "labels", names: ["Bug"] }, "Bug")).toBe(true);
		expect(isLabelActive({ kind: "labels", names: ["Bug"] }, "Idea")).toBe(
			false,
		);
		expect(isLabelActive(ALL_TAGS_FILTER, "Bug")).toBe(false);
	});
});

describe("tagFilterToListInput", () => {
	it("forwards labelsAny only for a non-empty labels filter", () => {
		expect(tagFilterToListInput(ALL_TAGS_FILTER)).toEqual({});
		expect(tagFilterToListInput({ kind: "unassigned" })).toEqual({});
		expect(tagFilterToListInput({ kind: "labels", names: [] })).toEqual({});
		expect(
			tagFilterToListInput({ kind: "labels", names: ["Bug", "Idea"] }),
		).toEqual({ labelsAny: ["Bug", "Idea"] });
	});

	it("returns a fresh array (no aliasing of the filter state)", () => {
		const filter: TagFilterState = { kind: "labels", names: ["Bug"] };
		const input = tagFilterToListInput(filter);
		input.labelsAny?.push("mutated");
		expect(filter.names).toEqual(["Bug"]);
	});
});

describe("sessionPassesFilter", () => {
	it("passes everything under all", () => {
		expect(sessionPassesFilter(ALL_TAGS_FILTER, [])).toBe(true);
		expect(sessionPassesFilter(ALL_TAGS_FILTER, ["Bug"])).toBe(true);
	});

	it("keeps only label-less sessions under unassigned", () => {
		expect(sessionPassesFilter({ kind: "unassigned" }, [])).toBe(true);
		expect(sessionPassesFilter({ kind: "unassigned" }, ["Bug"])).toBe(false);
	});

	it("keeps sessions matching ANY name under labels", () => {
		const filter: TagFilterState = { kind: "labels", names: ["Bug", "Idea"] };
		expect(sessionPassesFilter(filter, ["Idea"])).toBe(true);
		expect(sessionPassesFilter(filter, ["Other"])).toBe(false);
		expect(sessionPassesFilter(filter, [])).toBe(false);
	});
});
