import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MotionFrameProvider } from "../../MotionFrameProvider";
import { Reveal } from "./Reveal";

describe("Reveal", () => {
	it("renders content statically when entrances are disabled", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="off" persist={false}>
				<Reveal>Manifesto</Reveal>
			</MotionFrameProvider>,
		);
		expect(html).toContain("Manifesto");
		expect(html).toContain("overflow-hidden");
		expect(html).not.toContain("transform");
	});

	it("starts offset behind the mask when entrances are enabled", () => {
		const html = renderToStaticMarkup(
			<MotionFrameProvider defaultTier="essential" persist={false}>
				<Reveal direction="left">Manifesto</Reveal>
			</MotionFrameProvider>,
		);
		expect(html).toContain("Manifesto");
		// SSR snapshots the initial transform; direction "left" slides on X.
		expect(html).toContain("translateX(100%)");
	});
});
