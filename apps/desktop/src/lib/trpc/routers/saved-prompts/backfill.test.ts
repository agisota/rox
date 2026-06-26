import { describe, expect, test } from "bun:test";
import { decodeLegacyBody } from "./backfill";

describe("decodeLegacyBody", () => {
	test("returns the body unchanged when there is no metadata block", () => {
		const { body, meta } = decodeLegacyBody("just a prompt");
		expect(body).toBe("just a prompt");
		expect(meta).toEqual({
			tags: [],
			favorite: false,
			useCount: 0,
			lastUsedAt: null,
		});
	});

	test("strips the block and decodes tags/favorite/usage", () => {
		const stored =
			'Hello {{name}}\n\n<!--rox:meta {"tags":["a","b"],"favorite":true,"useCount":3,"lastUsedAt":123} -->';
		const { body, meta } = decodeLegacyBody(stored);
		expect(body).toBe("Hello {{name}}");
		expect(meta).toEqual({
			tags: ["a", "b"],
			favorite: true,
			useCount: 3,
			lastUsedAt: 123,
		});
	});

	test("normalizes/dedupes tags (case-insensitive, trimmed)", () => {
		const stored =
			'body\n\n<!--rox:meta {"tags":["  Foo ","foo","BAR",""]} -->';
		const { meta } = decodeLegacyBody(stored);
		expect(meta.tags).toEqual(["Foo", "BAR"]);
	});

	test("corrupt JSON still strips the block, yields empty metadata", () => {
		const stored = "body\n\n<!--rox:meta {not json} -->";
		const { body, meta } = decodeLegacyBody(stored);
		expect(body).toBe("body");
		expect(meta.tags).toEqual([]);
		expect(meta.favorite).toBe(false);
	});

	test("clamps invalid usage values to safe defaults", () => {
		const stored =
			'body\n\n<!--rox:meta {"useCount":-5,"lastUsedAt":"nope"} -->';
		const { meta } = decodeLegacyBody(stored);
		expect(meta.useCount).toBe(0);
		expect(meta.lastUsedAt).toBeNull();
	});
});
