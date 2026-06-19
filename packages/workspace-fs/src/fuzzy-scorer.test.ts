import { describe, expect, it } from "bun:test";
import {
	compareItemsByFuzzyScore,
	type FuzzyScorerCache,
	type IItemAccessor,
	prepareQuery,
	scoreFuzzy,
	scoreItemFuzzy,
} from "./fuzzy-scorer";

const fuzzy = (target: string, query: string, nonContiguous = true) =>
	scoreFuzzy(target, query, query.toLowerCase(), nonContiguous);

describe("scoreFuzzy", () => {
	it("returns no score for an empty target or query", () => {
		expect(fuzzy("", "x")).toEqual([0, []]);
		expect(fuzzy("abc", "")).toEqual([0, []]);
	});

	it("returns no score when the target is shorter than the query", () => {
		expect(fuzzy("ab", "abc")).toEqual([0, []]);
	});

	it("scores an exact match across all positions", () => {
		const [score, positions] = fuzzy("file", "file");
		expect(score).toBeGreaterThan(0);
		expect(positions).toEqual([0, 1, 2, 3]);
	});

	it("is case-insensitive", () => {
		expect(fuzzy("File", "file")[0]).toBeGreaterThan(0);
	});

	it("matches a contiguous substring and reports its positions", () => {
		const [score, positions] = fuzzy("myfile", "file");
		expect(score).toBeGreaterThan(0);
		expect(positions).toEqual([2, 3, 4, 5]);
	});

	it("matches non-contiguous characters only when allowed", () => {
		const [scoreOn, positionsOn] = fuzzy("foobar", "fb", true);
		expect(scoreOn).toBeGreaterThan(0);
		expect(positionsOn).toEqual([0, 3]);

		expect(fuzzy("foobar", "fb", false)[0]).toBe(0);
	});

	it("rewards camelCase word-boundary matches over mid-word ones", () => {
		expect(fuzzy("fooBar", "fb")[0]).toBeGreaterThan(fuzzy("foobar", "fb")[0]);
	});
});

describe("prepareQuery", () => {
	it("normalizes whitespace and quotes out of the query", () => {
		expect(prepareQuery("  foo  ").normalized).toBe("foo");
		expect(prepareQuery('"foo"').normalized).toBe("foo");
	});

	it("splits multi-word queries into pieces", () => {
		const q = prepareQuery("foo bar");
		expect(q.normalized).toBe("foobar");
		expect(q.values?.map((v) => v.normalized)).toEqual(["foo", "bar"]);
	});

	it("leaves single-word queries without pieces", () => {
		expect(prepareQuery("foo").values).toBeUndefined();
	});

	it("detects a path separator and normalizes backslashes", () => {
		expect(prepareQuery("src/foo").containsPathSeparator).toBe(true);
		expect(prepareQuery("a\\b").pathNormalized).toBe("a/b");
		expect(prepareQuery("plain").containsPathSeparator).toBe(false);
	});

	it("flags exact-match queries wrapped in quotes", () => {
		expect(prepareQuery('"exact"').expectContiguousMatch).toBe(true);
		expect(prepareQuery("loose").expectContiguousMatch).toBe(false);
	});
});

interface TestItem {
	label: string;
	description?: string;
	path?: string;
}

const accessor: IItemAccessor<TestItem> = {
	getItemLabel: (i) => i.label,
	getItemDescription: (i) => i.description,
	getItemPath: (i) => i.path,
};

describe("scoreItemFuzzy", () => {
	it("scores a label match and reports label positions", () => {
		const cache: FuzzyScorerCache = {};
		const result = scoreItemFuzzy(
			{ label: "index.ts" },
			prepareQuery("index"),
			true,
			accessor,
			cache,
		);
		expect(result.score).toBeGreaterThan(0);
		expect(result.labelMatch?.length).toBeGreaterThan(0);
	});

	it("returns a zero score when nothing matches", () => {
		const result = scoreItemFuzzy(
			{ label: "index.ts" },
			prepareQuery("zzz"),
			true,
			accessor,
			{},
		);
		expect(result.score).toBe(0);
	});

	it("treats a full-path identity as the highest score", () => {
		const result = scoreItemFuzzy(
			{ label: "foo.ts", path: "src/foo.ts" },
			prepareQuery("src/foo.ts"),
			true,
			accessor,
			{},
		);
		expect(result.score).toBe(1 << 18);
	});
});

describe("compareItemsByFuzzyScore", () => {
	it("ranks the better match first", () => {
		const items: TestItem[] = [{ label: "readme.md" }, { label: "index.ts" }];
		const query = prepareQuery("index");
		const cache: FuzzyScorerCache = {};
		const sorted = [...items].sort((a, b) =>
			compareItemsByFuzzyScore(a, b, query, true, accessor, cache),
		);
		expect(sorted[0]?.label).toBe("index.ts");
	});
});
