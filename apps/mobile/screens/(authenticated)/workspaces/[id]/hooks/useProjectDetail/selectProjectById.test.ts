import { describe, expect, test } from "bun:test";
import type { SelectProject } from "@rox/db/schema";
import { selectProjectById } from "./selectProjectById";

function project(id: string): SelectProject {
	return {
		id,
		name: id,
		slug: id,
		repoOwner: "acme",
		repoName: "app",
		defaultBranch: "main",
	} as SelectProject;
}

describe("selectProjectById", () => {
	const rows = [project("a"), project("b")];

	test("returns the matching project", () => {
		expect(selectProjectById(rows, "b")?.id).toBe("b");
	});

	test("returns null when not found", () => {
		expect(selectProjectById(rows, "zzz")).toBeNull();
	});

	test("returns null for empty/undefined data", () => {
		expect(selectProjectById(undefined, "a")).toBeNull();
		expect(selectProjectById([], "a")).toBeNull();
	});
});
