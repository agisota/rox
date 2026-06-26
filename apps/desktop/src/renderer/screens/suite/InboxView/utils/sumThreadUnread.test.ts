import { describe, expect, test } from "bun:test";
import { sumThreadUnread } from "./sumThreadUnread";

describe("sumThreadUnread", () => {
	test("sums per-thread unread counts", () => {
		expect(sumThreadUnread([{ unreadCount: 2 }, { unreadCount: 3 }, {}])).toBe(
			5,
		);
	});

	test("treats missing/null counts as zero", () => {
		expect(
			sumThreadUnread([{ unreadCount: null }, {}, { unreadCount: 4 }]),
		).toBe(4);
	});

	test("returns 0 for an empty list", () => {
		expect(sumThreadUnread([])).toBe(0);
	});
});
