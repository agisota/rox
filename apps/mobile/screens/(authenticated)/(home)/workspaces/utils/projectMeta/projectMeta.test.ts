import { describe, expect, test } from "bun:test";
import type { SelectProject } from "@rox/db/schema";
import { repoLabel, sortProjects } from "./projectMeta";

function project(
	name: string,
	overrides: Partial<SelectProject> = {},
): SelectProject {
	return {
		id: name,
		name,
		slug: name.toLowerCase(),
		repoOwner: "acme",
		repoName: "app",
		defaultBranch: "main",
		...overrides,
	} as SelectProject;
}

describe("repoLabel", () => {
	test("formats owner/name", () => {
		expect(
			repoLabel(project("X", { repoOwner: "rox", repoName: "core" })),
		).toBe("rox/core");
	});

	test("returns null when repo info is incomplete", () => {
		expect(
			repoLabel(project("X", { repoOwner: "", repoName: "core" })),
		).toBeNull();
	});
});

describe("sortProjects", () => {
	test("sorts alphabetically by name (case-insensitive)", () => {
		const sorted = sortProjects([
			project("Zebra"),
			project("alpha"),
			project("Mango"),
		]);
		expect(sorted.map((p) => p.name)).toEqual(["alpha", "Mango", "Zebra"]);
	});

	test("does not mutate the input array", () => {
		const input = [project("b"), project("a")];
		sortProjects(input);
		expect(input.map((p) => p.name)).toEqual(["b", "a"]);
	});

	test("handles empty input", () => {
		expect(sortProjects([])).toEqual([]);
	});
});
