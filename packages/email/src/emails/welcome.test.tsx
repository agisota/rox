import { describe, expect, it } from "bun:test";

// WelcomeEmail uses StandardLayout -> Footer, which reads
// NEXT_PUBLIC_MARKETING_URL at module-eval time via lib/env. Set it before the
// dynamic imports so the Footer's @t3-oss env validation passes. Pure render
// only; no network / Resend.
process.env.NEXT_PUBLIC_MARKETING_URL = "https://rox.one";

// React injects `<!-- -->` text-segment markers around interpolated values, so
// strip them so phrases that span an interpolation boundary can be asserted.
async function renderWelcome(props?: { userName?: string }) {
	const { render } = await import("@react-email/components");
	const { WelcomeEmail } = await import("./welcome");
	const html = await render(<WelcomeEmail {...props} />);
	return html.replace(/<!-- -->/g, "");
}

describe("WelcomeEmail", () => {
	it("greets the provided user name", async () => {
		const html = await renderWelcome({ userName: "Mark" });
		expect(html).toContain("Welcome to Rox, Mark!");
	});

	it("falls back to the default greeting when no name is given", async () => {
		const html = await renderWelcome();
		expect(html).toContain("Welcome to Rox, there!");
	});

	it("includes the Get Started CTA link", async () => {
		const html = await renderWelcome({ userName: "Sam" });
		expect(html).toContain("https://app.rox.one/onboarding");
		expect(html).toContain("Get Started");
	});

	it("links to documentation and support", async () => {
		const html = await renderWelcome();
		expect(html).toContain("https://rox.one/docs");
		expect(html).toContain("https://rox.one/support");
	});

	it("renders the footer marketing URL from env", async () => {
		const html = await renderWelcome();
		expect(html).toContain("https://rox.one/privacy");
		expect(html).toContain("https://rox.one/terms");
	});
});
