import { describe, expect, test } from "bun:test";
import { orgCollectionId } from "./collectionId";

describe("orgCollectionId", () => {
	test("v2_workspaces collection id is namespaced per org", () => {
		expect(orgCollectionId("v2_workspaces", "org-123")).toBe(
			"v2_workspaces-org-123",
		);
	});

	test("matches the shape the runtime collections use", () => {
		expect(orgCollectionId("tasks", "abc")).toBe("tasks-abc");
		expect(orgCollectionId("projects", "abc")).toBe("projects-abc");
	});

	test("workspace surface collections are namespaced per org (FN-087)", () => {
		expect(orgCollectionId("durable_sessions", "org-7")).toBe(
			"durable_sessions-org-7",
		);
		expect(orgCollectionId("terminals", "org-7")).toBe("terminals-org-7");
	});
});
