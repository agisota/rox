import { describe, expect, it } from "bun:test";
import { render } from "@react-email/components";
import { EnterpriseInquiryEmail } from "./enterprise-inquiry";

// EnterpriseInquiryEmail renders a standalone <Html> tree (no StandardLayout /
// Footer), so no env is required. Pure render only; no network / provider.
// Props are spread from objects so the `role` prop isn't mistaken for an HTML
// ARIA role attribute by the linter.

describe("EnterpriseInquiryEmail", () => {
	it("renders all required submitter fields", async () => {
		const html = await render(
			<EnterpriseInquiryEmail
				{...{
					name: "Katherine Johnson",
					role: "VP Engineering",
					company: "Orbital Corp",
					email: "kj@orbital.example",
				}}
			/>,
		);

		expect(html).toContain("New Enterprise Inquiry");
		expect(html).toContain("Katherine Johnson");
		expect(html).toContain("VP Engineering");
		expect(html).toContain("Orbital Corp");
		expect(html).toContain("kj@orbital.example");
	});

	it("omits the optional phone and message blocks when empty", async () => {
		const html = await render(
			<EnterpriseInquiryEmail
				{...{
					name: "Quiet Caller",
					role: "CTO",
					company: "Quiet Inc",
					email: "cto@quiet.example",
					phone: "",
					message: "",
				}}
			/>,
		);

		expect(html).not.toContain("Phone");
		expect(html).not.toContain("What problem are they trying to solve?");
	});

	it("includes the optional phone and message blocks when provided", async () => {
		const html = await render(
			<EnterpriseInquiryEmail
				{...{
					name: "Has Phone",
					role: "Founder",
					company: "Loud Inc",
					email: "founder@loud.example",
					phone: "+1-555-0100",
					message: "We need SSO and audit logs.",
				}}
			/>,
		);

		expect(html).toContain("Phone");
		expect(html).toContain("+1-555-0100");
		expect(html).toContain("What problem are they trying to solve?");
		expect(html).toContain("We need SSO and audit logs.");
	});

	it("renders the static heading and intro copy", async () => {
		const html = await render(
			<EnterpriseInquiryEmail
				{...{
					name: "Jane Doe",
					role: "Engineering Lead",
					company: "Acme Inc.",
					email: "jane@example.com",
				}}
			/>,
		);

		expect(html).toContain("New Enterprise Inquiry");
		expect(html).toContain(
			"A new enterprise inquiry was submitted from the marketing site.",
		);
		expect(html).toContain("Acme Inc.");
	});
});
