import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MotionFrameProvider } from "../MotionFrameProvider";
import { SufficiencyPanel } from "./SufficiencyPanel";

describe("SufficiencyPanel", () => {
	it("marks the panel set only when all four facets are filled", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider persist={false}>
				<SufficiencyPanel
					context="brief"
					criteria="lint green"
					rights="packages/ui"
					tools="motion, recharts"
				/>
			</MotionFrameProvider>,
		);
		expect(html).toContain('data-sufficiency="set"');
		expect(html).toContain(">Context<");
		expect(html).toContain(">Tools<");
		expect(html).toContain(">Rights<");
		expect(html).toContain(">Criteria<");
		expect(html).not.toContain("missing");
	});

	it("reports partial sufficiency and flags missing facets", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider persist={false}>
				<SufficiencyPanel context="brief" tools="motion" />
			</MotionFrameProvider>,
		);
		expect(html).toContain('data-sufficiency="partial"');
		expect(html).toContain("2/4");
		expect(html).toContain("missing");
	});

	it("colors the header dot by aggregate state (noise → transition → verified)", () => {
		// 0/4 — nothing in flight yet, so no transition token appears anywhere.
		const empty = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="essential" persist={false}>
				<SufficiencyPanel />
			</MotionFrameProvider>,
		);
		expect(empty).toContain("0/4");
		expect(empty).not.toContain("var(--state-transition)");

		// 2/4 — in flight; facet dots are only verified/noise, so the lone
		// transition token is the header summary dot.
		const partial = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="essential" persist={false}>
				<SufficiencyPanel context="brief" tools="motion" />
			</MotionFrameProvider>,
		);
		expect(partial).toContain("var(--state-transition)");
	});

	it("renders content statically when motion is off (clock-safe)", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="off" persist={false}>
				<SufficiencyPanel context="brief" criteria="c" rights="r" tools="t" />
			</MotionFrameProvider>,
		);
		expect(html).toContain("brief");
	});
});
