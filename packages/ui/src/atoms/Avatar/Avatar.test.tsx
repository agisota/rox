import { describe, expect, it } from "bun:test";
import { identityGlyph } from "@rox/shared/identity-glyph";
import { getInitials } from "@rox/shared/names";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
	it("renders initials from the full name", () => {
		const html = renderToStaticMarkup(<Avatar fullName="Mark Lindgreen" />);
		expect(html).toContain(getInitials("Mark Lindgreen"));
	});

	it("colours the fallback deterministically from a seed (F24)", () => {
		const html = renderToStaticMarkup(
			<Avatar seed="user_42" fullName="Mark Lindgreen" />,
		);
		const glyph = identityGlyph("user_42", "Mark Lindgreen");
		// React serialises the style object; the deterministic hsl background appears inline.
		expect(html).toContain(glyph.background);
		expect(html).toContain(getInitials("Mark Lindgreen"));
	});

	it("falls back to glyph initials from the seed when no name is given", () => {
		const html = renderToStaticMarkup(<Avatar seed="octocat" />);
		expect(html).toContain("OC");
	});

	it("uses no inline colour when no seed is provided", () => {
		const html = renderToStaticMarkup(<Avatar fullName="Mark Lindgreen" />);
		expect(html).not.toContain("background-color");
	});
});
