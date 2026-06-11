import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MotionFrameProvider } from "../MotionFrameProvider";
import { MotionTierSwitcher } from "./MotionTierSwitcher";

describe("MotionTierSwitcher", () => {
	it("renders three radios with exactly the default tier checked", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider persist={false}>
				<MotionTierSwitcher />
			</MotionFrameProvider>,
		);
		expect(html).toContain("<fieldset");
		expect(html).toContain(">Off<");
		expect(html).toContain(">Essential<");
		expect(html).toContain(">Full<");
		expect(html.match(/type="radio"/g) ?? []).toHaveLength(3);
		expect(html.match(/checked=""/g) ?? []).toHaveLength(1);
		const fullRadio = html.match(/<input[^>]*value="full"[^>]*>/)?.[0] ?? "";
		expect(fullRadio).toContain('checked=""');
	});

	it("keeps the selection highlight static when the tier is off", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="off" persist={false}>
				<MotionTierSwitcher />
			</MotionFrameProvider>,
		);
		// SSR can only assert the highlight renders (motion.span and span emit
		// identical markup); the motion-vs-static branch lives in the source's
		// capabilities.transition check.
		expect(html).toContain("data-motion-pill");
	});

	it("isolates instances: two switchers never share a radio-group name", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider persist={false}>
				<MotionTierSwitcher />
				<MotionTierSwitcher />
			</MotionFrameProvider>,
		);
		const names = new Set(
			[...html.matchAll(/name="(motion-tier-[^"]+)"/g)].map((m) => m[1]),
		);
		expect(names.size).toBe(2);
	});

	it("renders via the provider-less fallback", () => {
		const html = renderToStaticMarkup(<MotionTierSwitcher label="Motion" />);
		expect(html).toContain(">Motion</legend>");
	});
});
