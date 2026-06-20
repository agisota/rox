import { describe, expect, test } from "bun:test";
import { buildCreateTaskInput } from "./buildCreateTaskInput";

describe("buildCreateTaskInput", () => {
	test("builds a minimal payload with default priority", () => {
		expect(buildCreateTaskInput({ title: "Ship it" })).toEqual({
			title: "Ship it",
			priority: "none",
		});
	});

	test("trims the title and description", () => {
		expect(
			buildCreateTaskInput({
				title: "  Fix bug  ",
				description: "  details  ",
				priority: "high",
			}),
		).toEqual({
			title: "Fix bug",
			priority: "high",
			description: "details",
		});
	});

	test("includes statusId when provided", () => {
		expect(buildCreateTaskInput({ title: "t", statusId: "status-1" })).toEqual({
			title: "t",
			priority: "none",
			statusId: "status-1",
		});
	});

	test("omits empty description and null statusId", () => {
		expect(
			buildCreateTaskInput({ title: "t", description: "   ", statusId: null }),
		).toEqual({ title: "t", priority: "none" });
	});

	test("returns null for an empty/whitespace title", () => {
		expect(buildCreateTaskInput({ title: "" })).toBeNull();
		expect(buildCreateTaskInput({ title: "   " })).toBeNull();
	});
});
