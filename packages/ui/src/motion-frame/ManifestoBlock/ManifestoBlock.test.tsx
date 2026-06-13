import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MotionFrameProvider } from "../MotionFrameProvider";
import { ManifestoBlock } from "./ManifestoBlock";

describe("ManifestoBlock", () => {
	it("renders the kicker and every line in the display face", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider persist={false}>
				<ManifestoBlock
					kicker="State-first"
					lines={[
						{ id: "law", text: "Color is law." },
						{ id: "gov", text: "Motion has a governor." },
						{ id: "safe", text: "Content is clock-safe." },
					]}
				/>
			</MotionFrameProvider>,
		);
		expect(html).toContain("State-first");
		expect(html).toContain("Color is law.");
		expect(html).toContain("Motion has a governor.");
		expect(html).toContain("Content is clock-safe.");
		expect(html).toContain("font-frame-display");
	});

	it("renders duplicate statements without collapsing them", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider persist={false}>
				<ManifestoBlock
					lines={[
						{ id: "a", text: "Ship it." },
						{ id: "b", text: "Ship it." },
					]}
				/>
			</MotionFrameProvider>,
		);
		expect(html.match(/Ship it\./g) ?? []).toHaveLength(2);
	});

	it("renders lines statically (fully visible) when motion is off", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="off" persist={false}>
				<ManifestoBlock lines={[{ id: "x", text: "Ship it." }]} />
			</MotionFrameProvider>,
		);
		expect(html).toContain("Ship it.");
	});
});
