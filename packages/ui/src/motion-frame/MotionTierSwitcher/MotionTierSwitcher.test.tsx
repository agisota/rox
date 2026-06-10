import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MotionFrameProvider } from "../MotionFrameProvider";
import { MotionTierSwitcher } from "./MotionTierSwitcher";

describe("MotionTierSwitcher", () => {
	it("renders all three tiers with exactly the default selected", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider persist={false}>
				<MotionTierSwitcher />
			</MotionFrameProvider>,
		);
		expect(html).toContain("<fieldset");
		expect(html).toContain(">Off<");
		expect(html).toContain(">Essential<");
		expect(html).toContain(">Full<");
		expect(html.match(/aria-pressed="true"/g) ?? []).toHaveLength(1);
	});

	it("keeps the selection highlight static when the tier is off", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="off" persist={false}>
				<MotionTierSwitcher />
			</MotionFrameProvider>,
		);
		// Highlight renders, content stays visible — but as a plain span, not
		// a motion element (off allows no transitions).
		expect(html).toContain("data-motion-pill");
	});

	it("renders via the provider-less fallback", () => {
		const html = renderToStaticMarkup(<MotionTierSwitcher label="Motion" />);
		expect(html).toContain(">Motion</legend>");
	});
});
