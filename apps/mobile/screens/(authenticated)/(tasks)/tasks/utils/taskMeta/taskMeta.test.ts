import { describe, expect, test } from "bun:test";
import { assigneeInitials, priorityLabel, taskRef } from "./taskMeta";

describe("priorityLabel", () => {
	test("maps known priorities to capitalized labels", () => {
		expect(priorityLabel("urgent")).toBe("Urgent");
		expect(priorityLabel("high")).toBe("High");
		expect(priorityLabel("medium")).toBe("Medium");
		expect(priorityLabel("low")).toBe("Low");
	});

	test("returns null for 'none' (no chip)", () => {
		expect(priorityLabel("none")).toBeNull();
	});
});

describe("taskRef", () => {
	test("prefers externalKey when present", () => {
		expect(taskRef({ externalKey: "SUPER-172", slug: "fix-bug" })).toBe(
			"SUPER-172",
		);
	});

	test("falls back to slug when no externalKey", () => {
		expect(taskRef({ externalKey: null, slug: "fix-bug" })).toBe("fix-bug");
	});

	test("returns null when neither is present", () => {
		expect(taskRef({ externalKey: null, slug: "" })).toBeNull();
	});
});

describe("assigneeInitials", () => {
	test("takes first two initials of a full name", () => {
		expect(assigneeInitials("Ada Lovelace")).toBe("AL");
	});

	test("uppercases a single name initial", () => {
		expect(assigneeInitials("ada")).toBe("A");
	});

	test("falls back to '?' for empty/nullish", () => {
		expect(assigneeInitials(null)).toBe("?");
		expect(assigneeInitials("")).toBe("?");
		expect(assigneeInitials("   ")).toBe("?");
	});
});
