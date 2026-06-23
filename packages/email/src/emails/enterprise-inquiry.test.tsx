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

		expect(html).toContain("Новый запрос Enterprise");
		expect(html).not.toContain("New Enterprise Inquiry");
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

		expect(html).not.toContain("Телефон");
		expect(html).not.toContain("Какую задачу они хотят решить?");
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

		expect(html).toContain("Телефон");
		expect(html).toContain("+1-555-0100");
		expect(html).toContain("Какую задачу они хотят решить?");
		expect(html).toContain("We need SSO and audit logs.");
	});

	it("renders the static heading and intro copy in Russian", async () => {
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

		expect(html).toContain("Новый запрос Enterprise");
		expect(html).toContain(
			"С маркетингового сайта поступил новый запрос Enterprise.",
		);
		expect(html).toContain("Acme Inc.");
	});
});
