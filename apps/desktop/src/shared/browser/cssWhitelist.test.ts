import { describe, expect, it } from "bun:test";
import {
	CSS_WHITELIST,
	filterComputedStyles,
	isWhitelistedCssProperty,
} from "./cssWhitelist";

describe("cssWhitelist", () => {
	it("keeps only whitelisted properties", () => {
		const filtered = filterComputedStyles({
			color: "rgb(0, 0, 0)",
			"font-size": "16px",
			"-webkit-font-smoothing": "antialiased",
			"caret-color": "rgb(0, 0, 0)",
		});
		expect(filtered).toEqual({
			color: "rgb(0, 0, 0)",
			"font-size": "16px",
		});
	});

	it("drops empty, none, and normal noise values", () => {
		const filtered = filterComputedStyles({
			color: "  rgb(1, 2, 3)  ",
			background: "none",
			"letter-spacing": "normal",
			transform: "",
		});
		expect(filtered).toEqual({ color: "rgb(1, 2, 3)" });
	});

	it("never leaks a non-whitelisted property even if present", () => {
		const filtered = filterComputedStyles({
			content: "secret-token",
			cursor: "pointer",
		});
		expect(filtered.content).toBeUndefined();
		expect(filtered.cursor).toBe("pointer");
	});

	it("exposes a membership check", () => {
		expect(isWhitelistedCssProperty("display")).toBe(true);
		expect(isWhitelistedCssProperty("content")).toBe(false);
	});

	it("has no duplicate entries", () => {
		expect(new Set(CSS_WHITELIST).size).toBe(CSS_WHITELIST.length);
	});
});
