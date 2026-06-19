import { describe, expect, it } from "bun:test";
import { sleep } from "./async";

describe("sleep", () => {
	it("returns a promise", () => {
		expect(sleep(0)).toBeInstanceOf(Promise);
	});

	it("resolves to undefined after the delay", async () => {
		expect(await sleep(1)).toBeUndefined();
	});
});
