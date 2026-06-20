/// <reference types="bun-types" />
import { describe, expect, it } from "bun:test";

import { RoxError } from "../../core/error";
import { createPathTagFunction, encodeURIPath, path } from "./path";

/**
 * CHARACTERIZATION TESTS — the `path` tagged-template helper and its
 * percent-encoder. Captures current encoding behavior and the invalid-segment
 * guard (which throws RoxError) before any error-model refactor.
 */

describe("encodeURIPath", () => {
	it("leaves RFC 3986 path-safe characters untouched", () => {
		expect(encodeURIPath("abcXYZ-._~!$&'()*+,;=:@")).toBe(
			"abcXYZ-._~!$&'()*+,;=:@",
		);
	});

	it("percent-encodes unsafe characters such as spaces and slashes", () => {
		expect(encodeURIPath("a b")).toBe("a%20b");
		expect(encodeURIPath("a/b")).toBe("a%2Fb");
		expect(encodeURIPath("a?b")).toBe("a%3Fb");
	});
});

describe("path tagged template", () => {
	it("returns the single static segment verbatim when there are no params", () => {
		expect(path`/tasks`).toBe("/tasks");
	});

	it("interpolates and path-encodes string params", () => {
		const id = "SUPER 172";
		expect(path`/tasks/${id}`).toBe("/tasks/SUPER%20172");
	});

	it("encodes multiple params independently", () => {
		expect(path`/orgs/${"o 1"}/tasks/${"t/2"}`).toBe(
			"/orgs/o%201/tasks/t%2F2",
		);
	});

	it("uses encodeURIComponent for params after a query/hash boundary", () => {
		// Once a '?' appears in a static segment, later params use
		// encodeURIComponent (post-path) rather than the path encoder.
		expect(path`/search?q=${"a b"}`).toBe("/search?q=a%20b");
	});

	it("throws a RoxError when a param would introduce a '..' path segment", () => {
		expect(() => path`/tasks/${".."}`).toThrow(RoxError);
	});

	it("throws a RoxError when a param is null/undefined (not a valid path param)", () => {
		expect(() => path`/tasks/${null}`).toThrow(RoxError);
		expect(() => path`/tasks/${undefined}`).toThrow(RoxError);
	});
});

describe("createPathTagFunction", () => {
	it("uses a custom encoder for params", () => {
		const shout = createPathTagFunction((s) => s.toUpperCase());
		expect(shout`/x/${"abc"}`).toBe("/x/ABC");
	});
});
