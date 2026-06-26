import { describe, expect, it } from "bun:test";
import type { InboxItem } from "../types";
import { flattenGrouped, stepItemIndex } from "./groupRows";

const item = (key: string, ts: Date | null): InboxItem => ({
	key,
	source: "chat",
	threadId: key,
	title: key,
	preview: "",
	timestamp: ts,
	unreadCount: 0,
});

const TODAY = new Date();
const YESTERDAY = new Date(Date.now() - 24 * 60 * 60_000);
const OLD = new Date("2020-01-01T00:00:00Z");

describe("flattenGrouped", () => {
	it("emits a header when the date bucket changes", () => {
		const rows = flattenGrouped([
			item("a", TODAY),
			item("b", TODAY),
			item("c", YESTERDAY),
			item("d", OLD),
		]);
		const kinds = rows.map((r) =>
			r.kind === "header" ? `H:${r.group}` : `I:${r.item.key}`,
		);
		expect(kinds).toEqual([
			"H:today",
			"I:a",
			"I:b",
			"H:yesterday",
			"I:c",
			"H:earlier",
			"I:d",
		]);
	});

	it("produces no rows for an empty list", () => {
		expect(flattenGrouped([])).toEqual([]);
	});
});

describe("stepItemIndex", () => {
	const rows = flattenGrouped([
		item("a", TODAY),
		item("b", YESTERDAY),
		item("c", OLD),
	]);

	it("selects the first item when nothing is selected and going down", () => {
		const i = stepItemIndex(rows, null, 1);
		expect((rows[i] as { item: InboxItem }).item.key).toBe("a");
	});

	it("steps across a header boundary", () => {
		const i = stepItemIndex(rows, "a", 1);
		expect((rows[i] as { item: InboxItem }).item.key).toBe("b");
	});

	it("clamps at the end", () => {
		const i = stepItemIndex(rows, "c", 1);
		expect((rows[i] as { item: InboxItem }).item.key).toBe("c");
	});

	it("clamps at the start", () => {
		const i = stepItemIndex(rows, "a", -1);
		expect((rows[i] as { item: InboxItem }).item.key).toBe("a");
	});

	it("returns -1 when there are no items", () => {
		expect(stepItemIndex([], null, 1)).toBe(-1);
	});
});
