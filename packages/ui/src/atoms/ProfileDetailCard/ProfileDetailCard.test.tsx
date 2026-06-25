import { describe, expect, it } from "bun:test";
import { identityGlyph } from "@rox/shared/identity-glyph";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileDetailCard } from "./ProfileDetailCard";

describe("ProfileDetailCard", () => {
	it("renders the persona header with name and @handle", () => {
		const html = renderToStaticMarkup(
			<ProfileDetailCard
				persona={{ id: "persona_7", displayName: "Atlas", handle: "atlas" }}
			/>,
		);
		expect(html).toContain('data-testid="profile-detail-card"');
		expect(html).toContain("Atlas");
		expect(html).toContain("@atlas");
	});

	it("renders all detail fields when fully configured", () => {
		const html = renderToStaticMarkup(
			<ProfileDetailCard
				persona={{
					id: "persona_7",
					displayName: "Atlas",
					model: "claude-opus-4",
					provider: "anthropic",
					gateway: "rox-gateway",
					gatewayOnline: true,
					skills: ["search", "code"],
					defaultSpace: "Acme",
				}}
			/>,
		);
		expect(html).toContain("claude-opus-4");
		expect(html).toContain("anthropic");
		expect(html).toContain("rox-gateway");
		expect(html).toContain("search");
		expect(html).toContain("code");
		expect(html).toContain("Acme");
	});

	it("glows the status dot green when the gateway is online", () => {
		const html = renderToStaticMarkup(
			<ProfileDetailCard
				persona={{ id: "persona_7", displayName: "Atlas", gatewayOnline: true }}
			/>,
		);
		expect(html).toContain('data-online="true"');
		expect(html).toContain("В сети");
	});

	it("shows the offline status when the gateway is down", () => {
		const html = renderToStaticMarkup(
			<ProfileDetailCard
				persona={{
					id: "persona_7",
					displayName: "Atlas",
					gatewayOnline: false,
				}}
			/>,
		);
		expect(html).toContain('data-online="false"');
		expect(html).toContain("Не в сети");
	});

	it("falls back to em dashes for absent fields", () => {
		const html = renderToStaticMarkup(
			<ProfileDetailCard persona={{ id: "persona_7", displayName: "Atlas" }} />,
		);
		expect(html).toContain('data-testid="profile-detail-skills"');
		expect(html).toContain("—");
	});

	it("falls back to the deterministic accent for the header dot (F24)", () => {
		const html = renderToStaticMarkup(
			<ProfileDetailCard persona={{ id: "persona_7", displayName: "Atlas" }} />,
		);
		expect(html).toContain(identityGlyph("persona_7").background);
	});

	it("honours an explicit accentColor over the derived one", () => {
		const html = renderToStaticMarkup(
			<ProfileDetailCard
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
