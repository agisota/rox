import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PROJECT_TEMPLATES } from "../TemplateGalleryModal/templates";
import { TemplateMarketplacePanel } from "./TemplateMarketplacePanel";

describe("TemplateMarketplacePanel", () => {
	it("lists the real Rox project templates", () => {
		const markup = renderToStaticMarkup(
			<TemplateMarketplacePanel onOpenGallery={() => {}} />,
		);

		// Every catalog template the Template Gallery can actually create from is
		// surfaced in the marketplace.
		for (const template of PROJECT_TEMPLATES) {
			expect(markup).toContain(template.name);
		}
		expect(markup).toContain("Открыть галерею");
	});

	it("renders a card per real template plus the gallery CTA", () => {
		const markup = renderToStaticMarkup(
			<TemplateMarketplacePanel onOpenGallery={() => {}} />,
		);

		const buttonCount = (markup.match(/<button/g) ?? []).length;
		// One button per template + the "open gallery" CTA.
		expect(buttonCount).toBe(PROJECT_TEMPLATES.length + 1);
	});

	it("renders a read-only preview (all buttons disabled) without a handler", () => {
		const markup = renderToStaticMarkup(<TemplateMarketplacePanel />);

		const buttons = markup.match(/<button[^>]*>/g) ?? [];
		expect(buttons.length).toBe(PROJECT_TEMPLATES.length + 1);
		// Every rendered button is disabled when no open handler is supplied.
		expect(buttons.every((button) => button.includes("disabled"))).toBe(true);
	});

	it("restricts the listed templates to the provided catalog subset", () => {
		const subset = PROJECT_TEMPLATES.slice(0, 2);
		const markup = renderToStaticMarkup(
			<TemplateMarketplacePanel onOpenGallery={() => {}} templates={subset} />,
		);

		const buttonCount = (markup.match(/<button/g) ?? []).length;
		expect(buttonCount).toBe(subset.length + 1);
		for (const template of subset) {
			expect(markup).toContain(template.name);
		}
	});
});
