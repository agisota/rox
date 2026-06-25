import { describe, expect, it } from "bun:test";

import { identityGlyph } from "./identity-glyph";
import {
	LABEL_EMOJI,
	LABEL_LUCIDE_ICONS,
	LABEL_SWATCH_COUNT,
	LABEL_SWATCHES,
	lucideIconToken,
	parseLabelIcon,
	resolveLabelColor,
	roundRobinSwatch,
} from "./label-style";

describe("LABEL_SWATCHES", () => {
	it("has exactly LABEL_SWATCH_COUNT distinct HSL swatches", () => {
		expect(LABEL_SWATCHES).toHaveLength(LABEL_SWATCH_COUNT);
		expect(new Set(LABEL_SWATCHES).size).toBe(LABEL_SWATCH_COUNT);
		for (const swatch of LABEL_SWATCHES) {
			expect(swatch).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
		}
	});
});

describe("roundRobinSwatch", () => {
	it("cycles through the palette in order", () => {
		LABEL_SWATCHES.forEach((swatch, i) => {
			expect(roundRobinSwatch(i)).toBe(swatch);
		});
	});

	it("wraps after a full cycle", () => {
		expect(roundRobinSwatch(LABEL_SWATCH_COUNT)).toBe(roundRobinSwatch(0));
		expect(roundRobinSwatch(LABEL_SWATCH_COUNT + 3)).toBe(roundRobinSwatch(3));
	});

	it("clamps negative and fractional counts into range", () => {
		expect(roundRobinSwatch(-5)).toBe(roundRobinSwatch(0));
		expect(roundRobinSwatch(2.9)).toBe(roundRobinSwatch(2));
	});
});

describe("resolveLabelColor", () => {
	it("prefers an explicit colour", () => {
		expect(resolveLabelColor("hsl(1, 2%, 3%)", "x")).toBe("hsl(1, 2%, 3%)");
	});

	it("falls back to the deterministic auto-colour for the name", () => {
		expect(resolveLabelColor(null, "urgent")).toBe(
			identityGlyph("urgent").background,
		);
		expect(resolveLabelColor(undefined, "urgent")).toBe(
			identityGlyph("urgent").background,
		);
	});

	it("is stable across calls (byte-identical cross-platform)", () => {
		expect(resolveLabelColor(null, "team")).toBe(
			resolveLabelColor(null, "team"),
		);
	});
});

describe("parseLabelIcon", () => {
	it("treats empty/whitespace/absent tokens as none", () => {
		for (const token of [null, undefined, "", "   "]) {
			expect(parseLabelIcon(token)).toEqual({ kind: "none" });
		}
	});

	it("parses a curated lucide token", () => {
		expect(parseLabelIcon(lucideIconToken("rocket"))).toEqual({
			kind: "lucide",
			name: "rocket",
		});
	});

	it("treats an emoji token as emoji", () => {
		expect(parseLabelIcon("🚀")).toEqual({ kind: "emoji", emoji: "🚀" });
	});

	it("degrades an unknown lucide name to emoji rather than dropping it", () => {
		expect(parseLabelIcon("lucide:not-a-real-icon")).toEqual({
			kind: "emoji",
			emoji: "lucide:not-a-real-icon",
		});
	});

	it("trims surrounding whitespace before parsing", () => {
		expect(parseLabelIcon("  ⭐  ")).toEqual({ kind: "emoji", emoji: "⭐" });
	});

	it("round-trips every curated lucide name", () => {
		for (const name of LABEL_LUCIDE_ICONS) {
			expect(parseLabelIcon(lucideIconToken(name))).toEqual({
				kind: "lucide",
				name,
			});
		}
	});

	it("parses every curated emoji as emoji", () => {
		for (const emoji of LABEL_EMOJI) {
			expect(parseLabelIcon(emoji)).toEqual({ kind: "emoji", emoji });
		}
	});
});
