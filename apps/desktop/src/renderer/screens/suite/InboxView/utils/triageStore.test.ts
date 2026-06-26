import { describe, expect, it } from "bun:test";
import {
	archiveItem,
	EMPTY_TRIAGE,
	isArchived,
	isSnoozed,
	snoozeItem,
	unarchiveItem,
	unsnoozeItem,
} from "./triageStore";

describe("triageStore reducer", () => {
	it("archives and restores a row", () => {
		const archived = archiveItem(EMPTY_TRIAGE, "chat:1");
		expect(isArchived(archived, "chat:1")).toBe(true);
		const restored = unarchiveItem(archived, "chat:1");
		expect(isArchived(restored, "chat:1")).toBe(false);
	});

	it("snoozes a row until a future wake time", () => {
		const now = 1_000;
		const snoozed = snoozeItem(EMPTY_TRIAGE, "mail:2", now + 5_000);
		expect(isSnoozed(snoozed, "mail:2", now)).toBe(true);
		// After the wake time it is no longer snoozed.
		expect(isSnoozed(snoozed, "mail:2", now + 6_000)).toBe(false);
	});

	it("archiving clears an existing snooze (mutually exclusive)", () => {
		const now = 0;
		const snoozed = snoozeItem(EMPTY_TRIAGE, "chat:3", now + 10_000);
		const archived = archiveItem(snoozed, "chat:3");
		expect(isArchived(archived, "chat:3")).toBe(true);
		expect(isSnoozed(archived, "chat:3", now)).toBe(false);
	});

	it("snoozing clears an existing archive", () => {
		const archived = archiveItem(EMPTY_TRIAGE, "chat:4");
		const snoozed = snoozeItem(archived, "chat:4", 10_000);
		expect(isArchived(snoozed, "chat:4")).toBe(false);
		expect(isSnoozed(snoozed, "chat:4", 0)).toBe(true);
	});

	it("unsnooze wakes a row immediately", () => {
		const snoozed = snoozeItem(EMPTY_TRIAGE, "mail:5", 10_000);
		const woken = unsnoozeItem(snoozed, "mail:5");
		expect(isSnoozed(woken, "mail:5", 0)).toBe(false);
	});
});
