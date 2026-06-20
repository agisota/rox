import { describe, expect, test } from "bun:test";
import { applyPriorityChange, applyStatusChange } from "./applyTaskEdit";

describe("applyStatusChange", () => {
	test("writes the new status and reports a change", () => {
		const draft = { statusId: "a", priority: "none" as const };
		expect(applyStatusChange(draft, "b")).toBe(true);
		expect(draft.statusId).toBe("b");
	});

	test("is a no-op when unchanged", () => {
		const draft = { statusId: "a", priority: "none" as const };
		expect(applyStatusChange(draft, "a")).toBe(false);
		expect(draft.statusId).toBe("a");
	});
});

describe("applyPriorityChange", () => {
	test("writes the new priority and reports a change", () => {
		const draft = { statusId: "a", priority: "none" as const };
		expect(applyPriorityChange(draft, "high")).toBe(true);
		expect(draft.priority).toBe("high");
	});

	test("is a no-op when unchanged", () => {
		const draft = { statusId: "a", priority: "high" as const };
		expect(applyPriorityChange(draft, "high")).toBe(false);
		expect(draft.priority).toBe("high");
	});
});
