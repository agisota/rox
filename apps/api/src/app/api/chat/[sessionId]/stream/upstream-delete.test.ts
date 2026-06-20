import { describe, expect, it } from "bun:test";
import { upstreamDeleteSucceeded } from "./upstream-delete";

describe("upstreamDeleteSucceeded", () => {
	it("removes the DB row on a 2xx upstream delete", () => {
		expect(upstreamDeleteSucceeded(200)).toBe(true);
		expect(upstreamDeleteSucceeded(204)).toBe(true);
	});

	it("treats upstream 404 as success (idempotent: stream already gone)", () => {
		expect(upstreamDeleteSucceeded(404)).toBe(true);
	});

	it("keeps the DB row when the upstream delete fails", () => {
		expect(upstreamDeleteSucceeded(400)).toBe(false);
		expect(upstreamDeleteSucceeded(401)).toBe(false);
		expect(upstreamDeleteSucceeded(409)).toBe(false);
		expect(upstreamDeleteSucceeded(500)).toBe(false);
		expect(upstreamDeleteSucceeded(502)).toBe(false);
	});
});
