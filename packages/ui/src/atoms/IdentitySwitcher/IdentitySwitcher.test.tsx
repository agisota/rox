import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { IdentitySwitcher } from "./IdentitySwitcher";

const personas = [
	{ id: "persona_atlas", displayName: "Atlas", handle: "atlas" },
	{ id: "persona_nova", displayName: "Nova" },
] as const;

describe("IdentitySwitcher", () => {
	it("renders the placeholder label when no persona is active", () => {
		const html = renderToStaticMarkup(
			<IdentitySwitcher
				personas={personas}
				onSelect={() => {}}
				placeholder="Персона"
			/>,
		);
		expect(html).toContain('data-testid="identity-switcher-trigger"');
		expect(html).toContain("Персона");
	});

	it("shows the active persona's name in the trigger", () => {
		const html = renderToStaticMarkup(
			<IdentitySwitcher
				personas={personas}
				activeId="persona_atlas"
				onSelect={() => {}}
			/>,
		);
		expect(html).toContain("Atlas");
		expect(html).toContain('aria-label="Сменить персону: Atlas"');
	});

	it("disables the trigger when there are no personas", () => {
		const html = renderToStaticMarkup(
			<IdentitySwitcher personas={[]} onSelect={() => {}} />,
		);
		expect(html).toContain("disabled");
	});

	it("disables the trigger while loading", () => {
		const html = renderToStaticMarkup(
			<IdentitySwitcher personas={personas} onSelect={() => {}} loading />,
		);
		expect(html).toContain("disabled");
	});
});
