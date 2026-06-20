import { describe, expect, it } from "bun:test";
import {
	buildSectionLink,
	buildSharedArtifactLink,
	buildSharedSessionLink,
	buildSkillLink,
	formatShareDate,
	parseShareDate,
	parseSharePath,
	SHARE_SECTIONS,
	slugify,
} from "./share-link";

// 2026-06-19 -> 19-06-2026 (UTC, noon to avoid TZ edge).
const DATE = new Date(Date.UTC(2026, 5, 19, 12, 0, 0));

describe("slugify", () => {
	it("lowercases and hyphenates", () => {
		expect(slugify("Deep Research Plan")).toBe("deep-research-plan");
	});

	it("collapses runs of symbols into a single hyphen", () => {
		expect(slugify("Hello -- World!!")).toBe("hello-world");
	});

	it("trims leading/trailing hyphens", () => {
		expect(slugify("  ...Edge...  ")).toBe("edge");
	});

	it("strips diacritics", () => {
		expect(slugify("Café Déjà")).toBe("cafe-deja");
	});

	it("returns empty string for symbol-only input", () => {
		expect(slugify("!!!")).toBe("");
	});
});

describe("formatShareDate / parseShareDate", () => {
	it("formats DD-MM-YYYY zero-padded", () => {
		expect(formatShareDate(DATE)).toBe("19-06-2026");
		expect(formatShareDate(new Date(Date.UTC(2026, 0, 5, 12)))).toBe(
			"05-01-2026",
		);
	});

	it("parses a valid date string", () => {
		expect(parseShareDate("19-06-2026")).toEqual({
			day: 19,
			month: 6,
			year: 2026,
		});
	});

	it("rejects malformed date strings", () => {
		expect(parseShareDate("2026-06-19")).toBeNull();
		expect(parseShareDate("19-13-2026")).toBeNull();
		expect(parseShareDate("00-06-2026")).toBeNull();
		expect(parseShareDate("nope")).toBeNull();
	});
});

describe("builders", () => {
	it("builds a shared session link with trailing slash", () => {
		expect(
			buildSharedSessionLink({
				handle: "mark",
				id: "abc123",
				title: "My First Session",
				date: DATE,
			}),
		).toBe("/@mark/shared/sessions/abc123-my-first-session-19-06-2026/");
	});

	it("builds a shared artifact link without trailing slash", () => {
		expect(
			buildSharedArtifactLink({
				handle: "mark",
				id: "art9",
				title: "Repo Report",
				date: DATE,
			}),
		).toBe("/@mark/shared/artifacts/art9-repo-report-19-06-2026");
	});

	it("builds a skill link", () => {
		expect(buildSkillLink("mark", "Deep Research")).toBe(
			"/@mark/skills/deep-research",
		);
	});

	it("builds every section link", () => {
		for (const section of SHARE_SECTIONS) {
			expect(buildSectionLink("mark", section)).toBe(`/@mark/${section}`);
		}
	});
});

describe("parseSharePath", () => {
	it("round-trips a shared session link", () => {
		const path = buildSharedSessionLink({
			handle: "mark",
			id: "abc123",
			title: "My First Session",
			date: DATE,
		});
		expect(parseSharePath(path)).toEqual({
			kind: "shared_resource",
			handle: "mark",
			resource: "sessions",
			id: "abc123",
			slug: "my-first-session",
			date: { day: 19, month: 6, year: 2026 },
		});
	});

	it("round-trips a shared artifact link", () => {
		const path = buildSharedArtifactLink({
			handle: "mark",
			id: "art9",
			title: "Repo Report",
			date: DATE,
		});
		expect(parseSharePath(path)).toEqual({
			kind: "shared_resource",
			handle: "mark",
			resource: "artifacts",
			id: "art9",
			slug: "repo-report",
			date: { day: 19, month: 6, year: 2026 },
		});
	});

	it("round-trips a skill link", () => {
		const path = buildSkillLink("mark", "Deep Research");
		expect(parseSharePath(path)).toEqual({
			kind: "skill",
			handle: "mark",
			skill: "deep-research",
		});
	});

	it("round-trips every section link", () => {
		for (const section of SHARE_SECTIONS) {
			const path = buildSectionLink("mark", section);
			expect(parseSharePath(path)).toEqual({
				kind: "section",
				handle: "mark",
				section,
			});
		}
	});

	it("handles a multi-hyphen slug", () => {
		const parsed = parseSharePath(
			"/@mark/shared/artifacts/id1-a-b-c-19-06-2026",
		);
		expect(parsed).toEqual({
			kind: "shared_resource",
			handle: "mark",
			resource: "artifacts",
			id: "id1",
			slug: "a-b-c",
			date: { day: 19, month: 6, year: 2026 },
		});
	});

	it("rejects paths without an @handle", () => {
		expect(parseSharePath("/mark/skills/x")).toBeNull();
		expect(parseSharePath("/@/skills/x")).toBeNull();
	});

	it("rejects unknown sections and resources", () => {
		expect(parseSharePath("/@mark/unknown")).toBeNull();
		expect(parseSharePath("/@mark/shared/widgets/id1-x-19-06-2026")).toBeNull();
	});

	it("rejects a resource segment with a bad date", () => {
		expect(
			parseSharePath("/@mark/shared/sessions/id1-slug-99-99-2026"),
		).toBeNull();
	});
});
