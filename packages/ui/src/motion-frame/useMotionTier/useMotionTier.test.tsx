import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useMotionTier } from "./useMotionTier";

function Probe() {
	const { tier, effectiveTier, capabilities } = useMotionTier();
	return (
		<i
			data-tier={tier}
			data-effective={effectiveTier}
			data-loop={String(capabilities.loop)}
		/>
	);
}

describe("useMotionTier (no provider)", () => {
	it("falls back to the full tier when motion is allowed", () => {
		// In SSR `useReducedMotion` resolves to false, so the fallback is `full`.
		const html = renderToStaticMarkup(<Probe />);
		expect(html).toContain('data-tier="full"');
		expect(html).toContain('data-effective="full"');
		expect(html).toContain('data-loop="true"');
	});
});
