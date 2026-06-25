import { describe, expect, test } from "bun:test";
import { chatSessions } from "@rox/db/schema";
import { identityGlyph } from "@rox/shared/identity-glyph";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	buildLabelFilterConditions,
	createLabelSchema,
	defaultLabelColor,
	LABEL_NAME_MAX,
	listSessionsSchema,
	updateLabelSchema,
} from "./labels-schema";

// Render a drizzle SQL node to its concrete SQL string for byte-level
// assertions (mirrors the PgDialect().sqlToQuery harness in search-notes.test.ts).
const dialect = new PgDialect();
const render = (node: Parameters<typeof dialect.sqlToQuery>[0]) =>
	dialect.sqlToQuery(node);

describe("defaultLabelColor (auto-colour default)", () => {
	test("returns the identityGlyph background for the name", () => {
		expect(defaultLabelColor("urgent")).toBe(
			identityGlyph("urgent").background,
		);
	});

	test("is deterministic — same name → same colour", () => {
		expect(defaultLabelColor("design")).toBe(defaultLabelColor("design"));
	});

	test("renders a portable hsl(...) string", () => {
		expect(defaultLabelColor("backend")).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
	});

	test("different names generally get different colours", () => {
		// Not a hard guarantee (hash collisions are possible), but two short,
		// dissimilar names should differ — guards against a constant-colour bug.
		expect(defaultLabelColor("alpha")).not.toBe(defaultLabelColor("omega"));
	});
});

describe("createLabelSchema", () => {
	test("accepts a name with no colour/icon (server will default the colour)", () => {
		const parsed = createLabelSchema.parse({ name: "urgent" });
		expect(parsed.name).toBe("urgent");
		expect(parsed.color).toBeUndefined();
		expect(parsed.icon).toBeUndefined();
	});

	test("trims the name", () => {
		expect(createLabelSchema.parse({ name: "  spaced  " }).name).toBe("spaced");
	});

	test("rejects an empty name", () => {
		expect(() => createLabelSchema.parse({ name: "" })).toThrow();
		expect(() => createLabelSchema.parse({ name: "   " })).toThrow();
	});

	test("rejects a name over the length cap", () => {
		expect(() =>
			createLabelSchema.parse({ name: "x".repeat(LABEL_NAME_MAX + 1) }),
		).toThrow();
	});

	test("accepts an explicit colour + icon", () => {
		const parsed = createLabelSchema.parse({
			name: "ops",
			color: "hsl(10, 50%, 40%)",
			icon: "🚀",
		});
		expect(parsed.color).toBe("hsl(10, 50%, 40%)");
		expect(parsed.icon).toBe("🚀");
	});
});

describe("updateLabelSchema", () => {
	test("requires a labelId uuid", () => {
		expect(() => updateLabelSchema.parse({ name: "x" })).toThrow();
		expect(() => updateLabelSchema.parse({ labelId: "not-a-uuid" })).toThrow();
	});

	test("allows clearing the icon with null", () => {
		const parsed = updateLabelSchema.parse({
			labelId: "00000000-0000-0000-0000-000000000000",
			icon: null,
		});
		expect(parsed.icon).toBeNull();
	});

	test("allows a partial update (name only)", () => {
		const parsed = updateLabelSchema.parse({
			labelId: "00000000-0000-0000-0000-000000000000",
			name: "renamed",
		});
		expect(parsed.name).toBe("renamed");
		expect(parsed.color).toBeUndefined();
		expect(parsed.icon).toBeUndefined();
	});
});

describe("listSessionsSchema (label filters)", () => {
	test("absent input is valid (backward compatible)", () => {
		expect(listSessionsSchema.parse(undefined)).toBeUndefined();
	});

	test("empty object is valid (no filters)", () => {
		expect(listSessionsSchema.parse({})).toEqual({});
	});

	test("accepts labelsAny / labelsAll arrays", () => {
		const parsed = listSessionsSchema.parse({
			labelsAny: ["a", "b"],
			labelsAll: ["c"],
		});
		expect(parsed?.labelsAny).toEqual(["a", "b"]);
		expect(parsed?.labelsAll).toEqual(["c"]);
	});

	test("rejects an empty filter array (min 1)", () => {
		expect(() => listSessionsSchema.parse({ labelsAny: [] })).toThrow();
		expect(() => listSessionsSchema.parse({ labelsAll: [] })).toThrow();
	});

	test("rejects empty names inside a filter array", () => {
		expect(() => listSessionsSchema.parse({ labelsAll: [""] })).toThrow();
	});
});

describe("buildLabelFilterConditions (jsonb @> builder)", () => {
	const col = chatSessions.labels;

	test("no params → no conditions (query is unchanged)", () => {
		expect(buildLabelFilterConditions({ labelsColumn: col })).toEqual([]);
		expect(
			buildLabelFilterConditions({
				labelsColumn: col,
				labelsAny: [],
				labelsAll: [],
			}),
		).toEqual([]);
	});

	test("labelsAll → one @> containment over the whole array", () => {
		const conditions = buildLabelFilterConditions({
			labelsColumn: col,
			labelsAll: ["urgent", "backend"],
		});
		expect(conditions).toHaveLength(1);
		const first = conditions[0];
		if (!first) throw new Error("expected one condition");
		const { sql, params } = render(first);
		expect(sql).toContain("@>");
		expect(sql).toContain("::jsonb");
		// The whole list is bound as a single jsonb-array parameter.
		expect(params).toContain(JSON.stringify(["urgent", "backend"]));
	});

	test("labelsAny → OR of single-element containments, parenthesised", () => {
		const conditions = buildLabelFilterConditions({
			labelsColumn: col,
			labelsAny: ["a", "b", "c"],
		});
		expect(conditions).toHaveLength(1);
		const first = conditions[0];
		if (!first) throw new Error("expected one condition");
		const { sql, params } = render(first);
		// Two ORs join three single-element containments.
		expect(sql.match(/ OR /g)).toHaveLength(2);
		expect(sql.startsWith("(")).toBe(true);
		expect(sql.endsWith(")")).toBe(true);
		expect(params).toContain(JSON.stringify(["a"]));
		expect(params).toContain(JSON.stringify(["b"]));
		expect(params).toContain(JSON.stringify(["c"]));
	});

	test("labelsAny + labelsAll → two conditions (AND-composed by caller)", () => {
		const conditions = buildLabelFilterConditions({
			labelsColumn: col,
			labelsAny: ["a"],
			labelsAll: ["b"],
		});
		expect(conditions).toHaveLength(2);
	});

	test("binds names as parameters (no string interpolation / injection surface)", () => {
		const conditions = buildLabelFilterConditions({
			labelsColumn: col,
			labelsAll: ["'; drop table chat_sessions; --"],
		});
		const first = conditions[0];
		if (!first) throw new Error("expected one condition");
		const { sql, params } = render(first);
		expect(sql).not.toContain("drop table");
		expect(params).toContain(
			JSON.stringify(["'; drop table chat_sessions; --"]),
		);
	});
});
