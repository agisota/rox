import { describe, expect, it } from "bun:test";

import {
	filterWorkspaces,
	matchesWorkspace,
	type WorkspaceOption,
} from "./filter";

const ACME: WorkspaceOption = { id: "a", name: "Acme", path: "acme-corp" };
const BRAVO: WorkspaceOption = {
	id: "b",
	name: "Bravo Team",
	path: "~/projects/bravo",
};
const CHARLIE: WorkspaceOption = {
	id: "c",
	name: "Charlie",
	path: "charlie-org",
};
const OPTIONS: WorkspaceOption[] = [ACME, BRAVO, CHARLIE];

describe("matchesWorkspace", () => {
	it("matches everything for an empty query", () => {
		for (const option of OPTIONS) {
			expect(matchesWorkspace(option, "")).toBe(true);
			expect(matchesWorkspace(option, "   ")).toBe(true);
		}
	});

	it("matches by name case-insensitively", () => {
		expect(matchesWorkspace(ACME, "acme")).toBe(true);
		expect(matchesWorkspace(ACME, "ACME")).toBe(true);
		expect(matchesWorkspace(ACME, "zzz")).toBe(false);
	});

	it("matches by path when name does not match", () => {
		expect(matchesWorkspace(BRAVO, "projects/bravo")).toBe(true);
		expect(matchesWorkspace(CHARLIE, "charlie-org")).toBe(true);
	});
});

describe("filterWorkspaces", () => {
	it("filters by name or path", () => {
		expect(filterWorkspaces(OPTIONS, "bravo").map((o) => o.id)).toEqual(["b"]);
		expect(filterWorkspaces(OPTIONS, "org").map((o) => o.id)).toEqual(["c"]);
	});

	it("returns all options for an empty query", () => {
		expect(filterWorkspaces(OPTIONS, "").map((o) => o.id)).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("hoists the active workspace to the top", () => {
		expect(filterWorkspaces(OPTIONS, "", "c").map((o) => o.id)).toEqual([
			"c",
			"a",
			"b",
		]);
	});

	it("keeps non-active relative order stable", () => {
		expect(filterWorkspaces(OPTIONS, "", "b").map((o) => o.id)).toEqual([
			"b",
			"a",
			"c",
		]);
	});
});
