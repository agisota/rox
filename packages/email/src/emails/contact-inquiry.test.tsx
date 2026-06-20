import { describe, expect, it } from "bun:test";
import { render } from "@react-email/components";
import { ContactInquiryEmail } from "./contact-inquiry";

// ContactInquiryEmail renders a standalone <Html> tree (no StandardLayout /
// Footer), so no NEXT_PUBLIC_MARKETING_URL env is required. Pure render only;
// never touches the network or a provider.

describe("ContactInquiryEmail", () => {
	it("renders the provided submitter details into the HTML", async () => {
		const html = await render(
			<ContactInquiryEmail
				name="Ada Lovelace"
				email="ada@example.com"
				topic="Billing"
				message="I have a question about my invoice."
			/>,
		);

		expect(html).toContain("Новое сообщение из формы контактов");
		expect(html).not.toContain("New Contact Message");
		expect(html).toContain("Ada Lovelace");
		expect(html).toContain("ada@example.com");
		expect(html).toContain("Billing");
		expect(html).toContain("I have a question about my invoice.");
	});

	it("defaults the topic when it is omitted", async () => {
		const html = await render(
			<ContactInquiryEmail
				name="Jane Doe"
				email="jane@example.com"
				message="Hi"
			/>,
		);

		// `topic` has a component-level default value.
		expect(html).toContain("General question");
	});

	it("produces a plain-text version preserving the message body", async () => {
		const text = await render(
			<ContactInquiryEmail
				name="Grace Hopper"
				email="grace@example.com"
				topic="Support"
				message="Line one\nLine two"
			/>,
			{ plainText: true },
		);

		expect(text).toContain("Grace Hopper");
		expect(text).toContain("grace@example.com");
		expect(text).toContain("Support");
	});

	it("escapes the preview line content for name and email", async () => {
		const html = await render(
			<ContactInquiryEmail name="Tim" email="tim@example.com" message="hi" />,
		);

		// Preview text combines name + email.
		expect(html).toContain("Tim");
		expect(html).toContain("tim@example.com");
	});
});
