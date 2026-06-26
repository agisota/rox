import { describe, expect, it } from "bun:test";
import {
	BREAKPOINT_TIERS,
	BREAKPOINTS,
	type BreakpointTier,
	CASCADE_RULES,
	cascadeRulesFor,
	isTouchTier,
	MIN_TOUCH_TARGET_PX,
	resolveTier,
	tierMediaQuery,
} from "./breakpoints";

describe("resolveTier", () => {
	it("maps phone-tier widths (<= 640)", () => {
		expect(resolveTier(0)).toBe("phone");
		expect(resolveTier(320)).toBe("phone");
		expect(resolveTier(BREAKPOINTS.phoneMax)).toBe("phone");
	});

	it("maps tablet-tier widths (641–900)", () => {
		expect(resolveTier(BREAKPOINTS.tabletMin)).toBe("tablet");
		expect(resolveTier(768)).toBe("tablet");
		expect(resolveTier(BREAKPOINTS.wideMin - 1)).toBe("tablet");
	});

	it("maps wide-tier widths (>= 901)", () => {
		expect(resolveTier(BREAKPOINTS.wideMin)).toBe("wide");
		expect(resolveTier(1280)).toBe("wide");
		expect(resolveTier(3840)).toBe("wide");
	});

	it("is total at the exact tier boundaries", () => {
		// 640 phone, 641 tablet, 900 tablet, 901 wide — no gaps or overlaps.
		expect(resolveTier(640)).toBe("phone");
		expect(resolveTier(641)).toBe("tablet");
		expect(resolveTier(900)).toBe("tablet");
		expect(resolveTier(901)).toBe("wide");
	});

	it("falls back to wide for non-finite width (SSR / pre-measure)", () => {
		expect(resolveTier(Number.NaN)).toBe("wide");
		expect(resolveTier(Number.POSITIVE_INFINITY)).toBe("wide");
	});
});

describe("CASCADE_RULES", () => {
	it("docks every region on wide", () => {
		const rules = cascadeRulesFor("wide");
		expect(rules).toMatchObject({
			tier: "wide",
			sidebar: "docked",
			rightPanel: "docked",
			railAsHamburger: false,
			composer: "chips",
		});
	});

	it("overlays only the right panel on tablet", () => {
		const rules = cascadeRulesFor("tablet");
		expect(rules).toMatchObject({
			tier: "tablet",
			sidebar: "docked",
			rightPanel: "overlay",
			railAsHamburger: false,
			composer: "chips",
		});
	});

	it("collapses to drawers on phone", () => {
		const rules = cascadeRulesFor("phone");
		expect(rules).toMatchObject({
			tier: "phone",
			sidebar: "drawer",
			rightPanel: "slide-over",
			railAsHamburger: true,
			composer: "config-button",
		});
	});

	it("returns a stable reference per tier (safe in dep arrays)", () => {
		for (const tier of BREAKPOINT_TIERS) {
			expect(cascadeRulesFor(tier)).toBe(CASCADE_RULES[tier]);
			expect(cascadeRulesFor(tier)).toBe(cascadeRulesFor(tier));
		}
	});

	it("describes exactly the three tiers, widest first", () => {
		expect(BREAKPOINT_TIERS).toEqual(["wide", "tablet", "phone"]);
		const tiers = Object.keys(CASCADE_RULES) as BreakpointTier[];
		expect(new Set(tiers)).toEqual(new Set(BREAKPOINT_TIERS));
	});
});

describe("tierMediaQuery", () => {
	it("builds non-overlapping queries from the same bounds", () => {
		expect(tierMediaQuery("phone")).toBe(
			`(max-width: ${BREAKPOINTS.phoneMax}px)`,
		);
		expect(tierMediaQuery("tablet")).toBe(
			`(min-width: ${BREAKPOINTS.tabletMin}px) and (max-width: ${BREAKPOINTS.wideMin - 1}px)`,
		);
		expect(tierMediaQuery("wide")).toBe(
			`(min-width: ${BREAKPOINTS.wideMin}px)`,
		);
	});

	it("agrees with resolveTier at every boundary", () => {
		// A width resolved by resolveTier must fall inside that tier's query.
		const widths = [0, 320, 640, 641, 768, 900, 901, 1280, 3840];
		for (const width of widths) {
			const tier = resolveTier(width);
			// Re-derive containment from the same bounds the query uses.
			const inTier =
				(tier === "phone" && width <= BREAKPOINTS.phoneMax) ||
				(tier === "tablet" &&
					width >= BREAKPOINTS.tabletMin &&
					width < BREAKPOINTS.wideMin) ||
				(tier === "wide" && width >= BREAKPOINTS.wideMin);
			expect(inTier).toBe(true);
		}
	});
});

describe("touch tier", () => {
	it("treats only phone as touch-first", () => {
		expect(isTouchTier("phone")).toBe(true);
		expect(isTouchTier("tablet")).toBe(false);
		expect(isTouchTier("wide")).toBe(false);
	});

	it("exposes a 44px minimum touch target", () => {
		expect(MIN_TOUCH_TARGET_PX).toBe(44);
	});
});
