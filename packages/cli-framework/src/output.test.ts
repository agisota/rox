import { describe, expect, it } from "bun:test";
import { formatOutput, type OutputFlags, table } from "./output";

const flags = (o: Partial<OutputFlags> = {}): OutputFlags => ({
	json: false,
	quiet: false,
	...o,
});

describe("formatOutput", () => {
	it("renders JSON of the unwrapped data when json flag is set", () => {
		const out = formatOutput(
			{ data: { a: 1 } },
			undefined,
			flags({ json: true }),
		);
		expect(out).toBe(JSON.stringify({ a: 1 }, null, 2));
	});

	it("uses the raw result as data when there is no data field", () => {
		const out = formatOutput({ a: 1 }, undefined, flags({ json: true }));
		expect(out).toBe(JSON.stringify({ a: 1 }, null, 2));
	});

	it("prefers the display function when provided and not json/quiet", () => {
		const out = formatOutput(
			{ data: { name: "x" } },
			(d) => `display:${(d as { name: string }).name}`,
			flags(),
		);
		expect(out).toBe("display:x");
	});

	it("falls back to the message field when no display fn", () => {
		const out = formatOutput({ message: "hello" }, undefined, flags());
		expect(out).toBe("hello");
	});

	it("falls back to JSON when neither display nor message exist", () => {
		const out = formatOutput({ x: 2 }, undefined, flags());
		expect(out).toBe(JSON.stringify({ x: 2 }, null, 2));
	});

	it("extracts ids from an array of objects in quiet mode", () => {
		const out = formatOutput(
			{ data: [{ id: "a" }, { id: 2 }] },
			undefined,
			flags({ quiet: true }),
		);
		expect(out).toBe("a\n2");
	});

	it("passes through string array items in quiet mode", () => {
		const out = formatOutput(["a", "b"], undefined, flags({ quiet: true }));
		expect(out).toBe("a\nb");
	});

	it("extracts a single object id in quiet mode", () => {
		const out = formatOutput({ id: "solo" }, undefined, flags({ quiet: true }));
		expect(out).toBe("solo");
	});

	it("JSON-stringifies a value with no id in quiet mode", () => {
		const out = formatOutput({ foo: "bar" }, undefined, flags({ quiet: true }));
		expect(out).toBe(JSON.stringify({ foo: "bar" }));
	});

	it("json flag wins over a display function", () => {
		const out = formatOutput(
			{ data: { a: 1 } },
			() => "should-not-appear",
			flags({ json: true }),
		);
		expect(out).toBe(JSON.stringify({ a: 1 }, null, 2));
	});
});

describe("table", () => {
	it("returns a placeholder for empty data", () => {
		expect(table([], ["id"])).toBe("No results.");
	});

	it("uppercases column names as default headers", () => {
		const out = table([{ id: "1", name: "a" }], ["id", "name"]);
		const [header] = out.split("\n");
		expect(header).toContain("ID");
		expect(header).toContain("NAME");
	});

	it("uses custom headers when supplied", () => {
		const out = table([{ id: "1" }], ["id"], ["Identifier"]);
		expect(out.split("\n")[0]).toContain("Identifier");
	});

	it("renders a dash for null/undefined cells", () => {
		const out = table([{ id: "1", name: null }], ["id", "name"]);
		expect(out.split("\n")[1]).toContain("—");
	});

	it("reads nested values via dotted paths", () => {
		const out = table([{ user: { name: "deep" } }], ["user.name"]);
		expect(out.split("\n")[1]).toContain("deep");
	});

	it("truncates cells beyond the max column width with an ellipsis", () => {
		const out = table([{ name: "abcdefghij" }], ["name"], undefined, 5);
		const body = out.split("\n")[1] ?? "";
		expect(body).toContain("abcd…");
		expect(body).not.toContain("abcde…");
	});

	it("supports per-column max widths via an array", () => {
		const out = table([{ a: "xxxxxx", b: "yyyyyy" }], ["a", "b"], undefined, [
			3,
			undefined,
		]);
		const body = out.split("\n")[1] ?? "";
		expect(body).toContain("xx…");
		expect(body).toContain("yyyyyy");
	});
});
