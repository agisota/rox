import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MotionFrameProvider } from "../../MotionFrameProvider";
import { FadeLift } from "./FadeLift";

describe("FadeLift", () => {
	it("keeps content visible when motion is off (clock-safe resting state)", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="off">
				<FadeLift>visible-content</FadeLift>
			</MotionFrameProvider>,
		);
		expect(html).toContain("visible-content");
	});

	it("renders content under the full tier", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="full">
				<FadeLift>visible-content</FadeLift>
			</MotionFrameProvider>,
		);
		expect(html).toContain("visible-content");
	});
});
