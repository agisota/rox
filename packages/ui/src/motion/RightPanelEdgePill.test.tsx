import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RightPanelEdgePill } from "./RightPanelEdgePill";

describe("RightPanelEdgePill", () => {
	it("renders the pill with its reopen label when visible", () => {
		const html = renderToStaticMarkup(
			<RightPanelEdgePill visible onOpen={() => {}} />,
		);
		expect(html).toContain("data-right-panel-edge-pill");
		expect(html).toContain('aria-label="Open files panel"');
		expect(html).toContain('type="button"');
	});

	it("renders nothing when hidden", () => {
		const html = renderToStaticMarkup(
			<RightPanelEdgePill visible={false} onOpen={() => {}} />,
		);
		expect(html).toBe("");
	});

	it("honours a custom label", () => {
		const html = renderToStaticMarkup(
			<RightPanelEdgePill visible onOpen={() => {}} label="Show files" />,
		);
		expect(html).toContain('aria-label="Show files"');
	});

	it("sizes the pill from the shared geometry token (34×44)", () => {
		const html = renderToStaticMarkup(
			<RightPanelEdgePill visible onOpen={() => {}} />,
		);
		expect(html).toContain("width:34px");
		expect(html).toContain("height:44px");
	});
});
