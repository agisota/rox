import { describe, expect, test } from "bun:test";
import {
	assembleContactList,
	type ContactJoinRow,
	toContactListItem,
} from "./contacts";

/**
 * `assembleContactList` / `toContactListItem` — the pure mapping at the heart of
 * the CRM contacts read (`graph.listContacts`). Verified WITHOUT a live database:
 * the join + keyset SQL lives in `loadContacts`, but the row→view-model shaping
 * and the `limit + 1` cursor derivation are pure and unit-tested here.
 */

function row(
	over: Partial<ContactJoinRow> & { entityId: string },
): ContactJoinRow {
	return {
		slug: null,
		title: "Untitled",
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		displayName: null,
		primaryEmail: null,
		avatarUrl: null,
		isSelf: null,
		fields: null,
		...over,
	};
}

describe("toContactListItem", () => {
	test("maps a fully-detailed contact (entity node + detail row)", () => {
		const item = toContactListItem(
			row({
				entityId: "c1",
				slug: "ada-lovelace",
				title: "Ada Lovelace",
				displayName: "Ada Lovelace",
				primaryEmail: "ada@analytical.engine",
				avatarUrl: "https://cdn/ada.png",
				isSelf: false,
				fields: { org: "Analytical Engine Co", title: "Mathematician" },
			}),
		);
		expect(item).toEqual({
			entityId: "c1",
			slug: "ada-lovelace",
			title: "Ada Lovelace",
			displayName: "Ada Lovelace",
			primaryEmail: "ada@analytical.engine",
			avatarUrl: "https://cdn/ada.png",
			isSelf: false,
			fieldCount: 2,
			updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		});
	});

	test("null-coalesces a node that has no contacts detail row yet", () => {
		// A `kind=contact` node can exist before its 1:1 detail is written; the
		// LEFT JOIN yields null detail columns — the item must still be renderable.
		const item = toContactListItem(row({ entityId: "c2", title: "Pending" }));
		expect(item.displayName).toBeNull();
		expect(item.primaryEmail).toBeNull();
		expect(item.avatarUrl).toBeNull();
		expect(item.isSelf).toBe(false);
		expect(item.fieldCount).toBe(0);
	});

	test("isSelf passes through true", () => {
		const item = toContactListItem(
			row({ entityId: "me", isSelf: true, displayName: "Me" }),
		);
		expect(item.isSelf).toBe(true);
	});
});

describe("assembleContactList", () => {
	test("returns all rows and no cursor when at or under the limit", () => {
		const result = assembleContactList(
			[row({ entityId: "a" }), row({ entityId: "b" })],
			5,
		);
		expect(result.items.map((i) => i.entityId)).toEqual(["a", "b"]);
		expect(result.nextCursor).toBeUndefined();
	});

	test("trims the limit+1 probe row and sets nextCursor to the last KEPT id", () => {
		// Caller fetched `limit + 1` (=3) to detect overflow at limit=2.
		const result = assembleContactList(
			[row({ entityId: "a" }), row({ entityId: "b" }), row({ entityId: "c" })],
			2,
		);
		expect(result.items.map((i) => i.entityId)).toEqual(["a", "b"]);
		// Cursor is the last RETURNED row (b), not the probe row (c).
		expect(result.nextCursor).toBe("b");
	});

	test("empty input yields an empty page with no cursor", () => {
		const result = assembleContactList([], 10);
		expect(result.items).toEqual([]);
		expect(result.nextCursor).toBeUndefined();
	});

	test("preserves the (newest-first) order the query produced", () => {
		const result = assembleContactList(
			[
				row({ entityId: "newest", updatedAt: new Date("2026-03-03") }),
				row({ entityId: "older", updatedAt: new Date("2026-01-01") }),
			],
			10,
		);
		expect(result.items.map((i) => i.entityId)).toEqual(["newest", "older"]);
	});
});
