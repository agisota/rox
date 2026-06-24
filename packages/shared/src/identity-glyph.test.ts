import { describe, expect, it } from "bun:test";
import {
	GLYPH_VARIANT_COUNT,
	glyphVariant,
	hashSeed,
	hueFromSeed,
	identityGlyph,
	initialsFrom,
} from "./identity-glyph";

describe("hashSeed", () => {
	it("is deterministic for the same seed", () => {
		expect(hashSeed("user_123")).toBe(hashSeed("user_123"));
	});

	it("returns a non-negative 32-bit integer", () => {
		for (const seed of ["", "a", "user_123", "Марк", "🚀x"]) {
			const h = hashSeed(seed);
			expect(Number.isInteger(h)).toBe(true);
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThanOrEqual(0xffffffff);
		}
	});

	it("hashes an empty seed deterministically to the FNV offset basis", () => {
		expect(hashSeed("")).toBe(0x811c9dc5);
	});

	it("produces different hashes for different seeds", () => {
		expect(hashSeed("alice")).not.toBe(hashSeed("bob"));
	});
});

describe("hueFromSeed", () => {
	it("stays within 0..359", () => {
		for (const seed of ["", "a", "workspace-personal", "persona:researcher"]) {
			const hue = hueFromSeed(seed);
			expect(hue).toBeGreaterThanOrEqual(0);
			expect(hue).toBeLessThan(360);
		}
	});

	it("is stable across calls (same colour everywhere)", () => {
		expect(hueFromSeed("org_42")).toBe(hueFromSeed("org_42"));
	});
});

describe("glyphVariant", () => {
	it("stays within 0..GLYPH_VARIANT_COUNT-1", () => {
		for (const seed of ["", "a", "tag:urgent", "user_999"]) {
			const v = glyphVariant(seed);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(GLYPH_VARIANT_COUNT);
		}
	});

	it("is deterministic and decoupled from the hue", () => {
		expect(glyphVariant("seed-x")).toBe(glyphVariant("seed-x"));
		// Offsetting the seed means the variant is not just hue % count.
		expect(glyphVariant("seed-x")).not.toBe(hueFromSeed("seed-x"));
	});
});

describe("initialsFrom", () => {
	it("takes first letters of the first two words", () => {
		expect(initialsFrom("Mark Lindgreen")).toBe("ML");
		expect(initialsFrom("ada b cook")).toBe("AB");
	});

	it("takes the first two letters of a single word", () => {
		expect(initialsFrom("mark")).toBe("MA");
		expect(initialsFrom("x")).toBe("X");
	});

	it("ignores leading emoji, @ and punctuation", () => {
		expect(initialsFrom("@mark")).toBe("MA");
		expect(initialsFrom("🚀 Rocket Lab")).toBe("RL");
		expect(initialsFrom("…hello")).toBe("HE");
	});

	it("supports non-latin scripts", () => {
		expect(initialsFrom("Марк Линдгрен")).toBe("МЛ");
	});

	it("returns '?' when there is no usable character", () => {
		expect(initialsFrom("")).toBe("?");
		expect(initialsFrom("   ")).toBe("?");
		expect(initialsFrom("🚀")).toBe("?");
	});
});

describe("identityGlyph", () => {
	it("is fully deterministic for the same inputs", () => {
		expect(identityGlyph("user_1", "Mark")).toEqual(
			identityGlyph("user_1", "Mark"),
		);
	});

	it("builds a comma-form HSL background carrying the seed hue", () => {
		const g = identityGlyph("org_42", "Acme Team");
		expect(g.background).toBe(`hsl(${g.hue}, 58%, 46%)`);
		expect(g.foreground).toBe("hsl(0, 0%, 100%)");
	});

	it("derives initials from the display name", () => {
		expect(identityGlyph("user_1", "Mark Lindgreen").initials).toBe("ML");
	});

	it("falls back to the seed for initials when no name is given", () => {
		expect(identityGlyph("octocat").initials).toBe("OC");
	});

	it("exposes an in-range glyph variant", () => {
		const g = identityGlyph("persona:researcher", "Researcher");
		expect(g.variant).toBeGreaterThanOrEqual(0);
		expect(g.variant).toBeLessThan(GLYPH_VARIANT_COUNT);
	});

	it("gives the same colour regardless of display name (colour keyed on seed)", () => {
		expect(identityGlyph("user_1", "Mark").hue).toBe(
			identityGlyph("user_1", "Different Name").hue,
		);
	});
});
