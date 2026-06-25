import { describe, expect, it } from "bun:test";
import { identityGlyph } from "@rox/shared/identity-glyph";
import { renderToStaticMarkup } from "react-dom/server";
import { DualIdentityCard } from "./DualIdentityCard";

const human = {
	id: "user_42",
	displayName: "Mark Lindgreen",
	handle: "mark",
	online: true,
};

describe("DualIdentityCard", () => {
	it("renders the human half with name and @handle", () => {
		const html = renderToStaticMarkup(<DualIdentityCard human={human} />);
		expect(html).toContain("Mark Lindgreen");
		expect(html).toContain("@mark");
		expect(html).toContain('data-testid="identity-human"');
	});

	it("shows the empty-persona state when no persona is given", () => {
		const html = renderToStaticMarkup(<DualIdentityCard human={human} />);
		expect(html).toContain('data-testid="identity-persona-empty"');
		expect(html).toContain("Персона не выбрана");
	});

	it("renders the active persona half with model, gateway and skills", () => {
		const html = renderToStaticMarkup(
			<DualIdentityCard
				human={human}
				persona={{
					id: "persona_7",
					displayName: "Atlas",
					handle: "atlas",
					model: "claude-opus-4",
					gateway: "rox-gateway",
					gatewayOnline: true,
					skills: ["search", "code"],
				}}
			/>,
		);
		expect(html).toContain('data-testid="identity-persona"');
		expect(html).toContain("Atlas");
		expect(html).toContain("claude-opus-4");
		expect(html).toContain("rox-gateway");
		expect(html).toContain("search");
		expect(html).toContain("code");
	});

	it("falls back to the deterministic accent for the persona dot (F24)", () => {
		const html = renderToStaticMarkup(
			<DualIdentityCard
				human={human}
				persona={{ id: "persona_7", displayName: "Atlas" }}
			/>,
		);
		// No explicit accentColor → deterministic identityGlyph background.
		expect(html).toContain(identityGlyph("persona_7").background);
	});

	it("honours an explicit persona accentColor over the derived one", () => {
		const html = renderToStaticMarkup(
			<DualIdentityCard
				human={human}
				persona={{
					id: "persona_7",
					displayName: "Atlas",
					accentColor: "hsl(10, 90%, 50%)",
				}}
			/>,
		);
		expect(html).toContain("hsl(10, 90%, 50%)");
	});
});
