import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MotionFrameProvider } from "../../MotionFrameProvider";
import { LoopMarquee } from "./LoopMarquee";

describe("LoopMarquee", () => {
	it("renders a single static row when loops are disabled", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="essential" persist={false}>
				<LoopMarquee>event.received</LoopMarquee>
			</MotionFrameProvider>,
		);
		expect(html.match(/event\.received/g) ?? []).toHaveLength(1);
		expect(html).not.toContain("aria-hidden");
	});

	it("duplicates content for the seamless wrap when loops are enabled", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="full" persist={false}>
				<LoopMarquee>event.received</LoopMarquee>
			</MotionFrameProvider>,
		);
		expect(html.match(/event\.received/g) ?? []).toHaveLength(2);
		expect(html).toContain("aria-hidden");
	});
});
