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
});
