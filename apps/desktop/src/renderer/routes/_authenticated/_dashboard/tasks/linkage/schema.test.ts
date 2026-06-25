import { describe, expect, test } from "bun:test";
import { taskLinkId, taskLinkSchema } from "./schema";

describe("taskLinkId", () => {
	test("is stable for the same task↔target pair", () => {
		const params = {
			projectId: "proj-1",
			taskId: "task-1",
			kind: "pr" as const,
			targetNumber: 42,
		};
		expect(taskLinkId(params)).toBe("proj-1:task-1:pr:42");
		expect(taskLinkId(params)).toBe(taskLinkId(params));
	});

	test("distinguishes pr from issue with the same number", () => {
		const base = { projectId: "p", taskId: "t", targetNumber: 7 };
		expect(taskLinkId({ ...base, kind: "pr" })).not.toBe(
			taskLinkId({ ...base, kind: "issue" }),
		);
	});

	test("distinguishes different tasks", () => {
		expect(
			taskLinkId({
				projectId: "p",
				taskId: "a",
				kind: "issue",
				targetNumber: 1,
			}),
		).not.toBe(
			taskLinkId({
				projectId: "p",
				taskId: "b",
				kind: "issue",
				targetNumber: 1,
			}),
		);
	});
});

describe("taskLinkSchema", () => {
	test("coerces an ISO string createdAt into a Date", () => {
		const parsed = taskLinkSchema.parse({
			id: "p:t:pr:1",
			projectId: "p",
			taskId: "t",
			kind: "pr",
			targetNumber: 1,
			targetTitle: "Fix bug",
			targetUrl: "https://github.com/x/y/pull/1",
			createdAt: "2026-06-25T00:00:00.000Z",
		});
		expect(parsed.createdAt).toBeInstanceOf(Date);
	});

	test("rejects a non-positive target number", () => {
		expect(() =>
			taskLinkSchema.parse({
				id: "p:t:pr:0",
				projectId: "p",
				taskId: "t",
				kind: "pr",
				targetNumber: 0,
				targetTitle: "x",
				targetUrl: "u",
				createdAt: new Date(),
			}),
		).toThrow();
	});
});
