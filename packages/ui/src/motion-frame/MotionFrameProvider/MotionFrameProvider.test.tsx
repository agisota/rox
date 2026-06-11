import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useMotionTier } from "../useMotionTier";
import { clampTier, MotionFrameProvider } from "./MotionFrameProvider";

function Probe() {
	const { effectiveTier, capabilities } = useMotionTier();
	return <i data-tier={effectiveTier} data-loop={String(capabilities.loop)} />;
}

describe("MotionFrameProvider", () => {
	it("defaults to the full tier with loops enabled", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider>
				<Probe />
			</MotionFrameProvider>,
		);
		expect(html).toContain('data-tier="full"');
		expect(html).toContain('data-loop="true"');
	});

	it("disables every capability in the off tier", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="off">
				<Probe />
			</MotionFrameProvider>,
		);
		expect(html).toContain('data-tier="off"');
		expect(html).toContain('data-loop="false"');
	});
});

describe("clampTier", () => {
	it("passes the tier through when reduced motion is off", () => {
		expect(clampTier("full", false)).toBe("full");
		expect(clampTier("essential", false)).toBe("essential");
	});

	it("clamps every tier to off when reduced motion is on", () => {
		expect(clampTier("full", true)).toBe("off");
		expect(clampTier("essential", true)).toBe("off");
		expect(clampTier("off", true)).toBe("off");
	});
});
