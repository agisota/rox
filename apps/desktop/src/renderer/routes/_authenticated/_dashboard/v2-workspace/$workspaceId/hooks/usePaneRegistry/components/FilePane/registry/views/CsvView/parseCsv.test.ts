import { describe, expect, test } from "bun:test";
import { parseCsv } from "./parseCsv";

describe("parseCsv", () => {
	test("splits header from rows", () => {
		const result = parseCsv("name,age\nAda,36\nGrace,40", ",");
		expect(result.headers).toEqual(["name", "age"]);
		expect(result.rows).toEqual([
			["Ada", "36"],
			["Grace", "40"],
		]);
	});

	test("respects quoted fields containing the delimiter", () => {
		const result = parseCsv('a,b\n"x,y",z', ",");
		expect(result.headers).toEqual(["a", "b"]);
		expect(result.rows).toEqual([["x,y", "z"]]);
	});

	test("parses tab-delimited content", () => {
		const result = parseCsv("a\tb\n1\t2", "\t");
		expect(result.headers).toEqual(["a", "b"]);
		expect(result.rows).toEqual([["1", "2"]]);
	});

	test("returns empty shape for empty input", () => {
		const result = parseCsv("", ",");
		expect(result.headers).toEqual([]);
		expect(result.rows).toEqual([]);
	});
});
