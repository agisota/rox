import { describe, expect, it } from "bun:test";
import {
	buildCssSelector,
	buildSelectorHints,
	buildXPath,
} from "./selectorHints";
import type { RawElementDescriptor } from "./types";

function desc(over: Partial<RawElementDescriptor>): RawElementDescriptor {
	return {
		tagName: "DIV",
		classList: [],
		attributes: {},
		outerHTML: "<div></div>",
		computedStyles: {},
		rect: { x: 0, y: 0, width: 10, height: 10 },
		viewport: { width: 1280, height: 800, devicePixelRatio: 2 },
		domPath: [],
		...over,
	};
}

describe("buildCssSelector", () => {
	it("prefers a test id", () => {
		const s = buildCssSelector(
			desc({ attributes: { "data-testid": "submit-btn" }, id: "x" }),
		);
		expect(s).toBe('div[data-testid="submit-btn"]');
	});

	it("falls back to id, then classes, then role, then tag", () => {
		expect(buildCssSelector(desc({ id: "main" }))).toBe("div#main");
		expect(buildCssSelector(desc({ classList: ["a", "b", "c", "d"] }))).toBe(
			"div.a.b.c",
		);
		expect(buildCssSelector(desc({ role: "button" }))).toBe(
			'div[role="button"]',
		);
		expect(buildCssSelector(desc({}))).toBe("div");
	});

	it("escapes non-identifier characters in ids/classes", () => {
		expect(buildCssSelector(desc({ classList: ["w-1/2"] }))).toBe(
			"div.w-1\\/2",
		);
	});
});

describe("buildXPath", () => {
	it("builds an indexed path root-first", () => {
		const s = buildXPath(
			desc({
				domPath: [
					{ tagName: "BODY", index: 1 },
					{ tagName: "MAIN", index: 1 },
					{ tagName: "DIV", index: 2 },
				],
			}),
		);
		expect(s).toBe("/body[1]/main[1]/div[2]");
	});

	it("degrades to just the tag with no ancestry", () => {
		expect(buildXPath(desc({ tagName: "SPAN" }))).toBe("/span");
	});
});

describe("buildSelectorHints", () => {
	it("assembles css/xpath/role/testId/text snippet", () => {
		const hints = buildSelectorHints(
			desc({
				attributes: { "data-testid": "card", role: "region" },
				role: "region",
				textSnippet: "  Hello world  ",
				domPath: [{ tagName: "BODY", index: 1 }],
			}),
		);
		expect(hints.css).toBe('div[data-testid="card"]');
		expect(hints.xpath).toBe("/body[1]");
		expect(hints.role).toBe("region");
		expect(hints.testId).toBe("card");
		expect(hints.textSnippet).toBe("Hello world");
	});

	it("truncates long text snippets and omits empty ones", () => {
		const long = buildSelectorHints(desc({ textSnippet: "a".repeat(300) }));
		expect(long.textSnippet?.length).toBe(120);
		const none = buildSelectorHints(desc({ textSnippet: "   " }));
		expect(none.textSnippet).toBeUndefined();
	});
});
