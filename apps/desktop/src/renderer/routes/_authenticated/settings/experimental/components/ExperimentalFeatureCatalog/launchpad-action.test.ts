import { describe, expect, it } from "bun:test";
import { getLaunchpadAction } from "./launchpad-action";

describe("getLaunchpadAction", () => {
	it("routes the template marketplace into the real gallery", () => {
		expect(getLaunchpadAction("templates.marketplace")).toBe(
			"open-template-gallery",
		);
	});

	it("falls back to scrolling for surfaces without a built entry point", () => {
		expect(getLaunchpadAction("agentNative.sourceMarketplace")).toBe(
			"scroll-to-card",
		);
		expect(getLaunchpadAction("collaboration.presence")).toBe("scroll-to-card");
		expect(getLaunchpadAction("rooms.operationsCommandCenter")).toBe(
			"scroll-to-card",
		);
	});
});
