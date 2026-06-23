import { describe, expect, it } from "bun:test";
import { mapFileSearchResults } from "./mapFileSearchResults";

type Match = {
	absolutePath: string;
	relativePath: string;
	name: string;
	kind: "file";
	score: number;
};

function match(relativePath: string, score = 1): Match {
	const name = relativePath.split("/").pop() ?? relativePath;
	return {
		absolutePath: `/home/rox/projects/demo/${relativePath}`,
		relativePath,
		name,
		kind: "file",
		score,
	};
}

describe("mapFileSearchResults", () => {
	it("returns an empty array when matches are undefined", () => {
		expect(mapFileSearchResults(undefined)).toEqual([]);
	});

	it("returns an empty array when there are no matches", () => {
		expect(mapFileSearchResults([])).toEqual([]);
	});

	it("maps matches to the minimal popover shape and keeps order", () => {
		const results = mapFileSearchResults([
			match("src/index.ts", 9),
			match("src/lib/util.ts", 4),
		]);

		expect(results).toEqual([
			{
				id: "/home/rox/projects/demo/src/index.ts",
				name: "index.ts",
				relativePath: "src/index.ts",
			},
			{
				id: "/home/rox/projects/demo/src/lib/util.ts",
				name: "util.ts",
				relativePath: "src/lib/util.ts",
			},
		]);
	});

	it("uses the absolute path as a stable id, distinguishing same-named files", () => {
		const results = mapFileSearchResults([
			match("a/config.ts"),
			match("b/config.ts"),
		]);

		expect(results.map((r) => r.id)).toEqual([
			"/home/rox/projects/demo/a/config.ts",
			"/home/rox/projects/demo/b/config.ts",
		]);
		expect(new Set(results.map((r) => r.id)).size).toBe(2);
	});

	it("inserts the workspace-relative path (never the absolute path) as the mention", () => {
		const [result] = mapFileSearchResults([match("packages/api/server.ts")]);

		expect(result?.relativePath).toBe("packages/api/server.ts");
		// The mention text is the relative path, so the absolute on-disk location
		// never leaks into the composed message.
		expect(result?.relativePath.startsWith("/")).toBe(false);
	});
});
