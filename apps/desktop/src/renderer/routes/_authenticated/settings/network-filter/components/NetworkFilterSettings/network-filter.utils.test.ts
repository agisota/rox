import { describe, expect, it } from "bun:test";
import { shouldRenderNetworkFilter } from "./network-filter.utils";

describe("shouldRenderNetworkFilter", () => {
	it("renders only when the flag resolves to true", () => {
		expect(shouldRenderNetworkFilter(true)).toBe(true);
	});

	it("does not render when the flag is false", () => {
		expect(shouldRenderNetworkFilter(false)).toBe(false);
	});

	it("does not render while the flag is still unresolved (undefined)", () => {
		expect(shouldRenderNetworkFilter(undefined)).toBe(false);
	});
});
