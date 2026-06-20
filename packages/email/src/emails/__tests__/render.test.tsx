import { describe, expect, it } from "bun:test";
import type { ReactElement } from "react";

// Consolidated render-smoke harness for ALL 12 @rox/email templates. This is the
// translation-completeness + render-safety regression gate.
//
// CRITICAL: every StandardLayout-based template imports Footer -> lib/env, which
// runs `createEnv(...)` with a REQUIRED `NEXT_PUBLIC_MARKETING_URL` at
// module-eval time. If it is unset, importing the template throws
// "Invalid environment variables" before any assertion runs. So we set it BEFORE
// the dynamic imports below. Pure render only — never touches the network or a
// provider.
process.env.NEXT_PUBLIC_MARKETING_URL = "https://rox.one";

async function renderOf(jsx: ReactElement): Promise<string> {
	const { render } = await import("@react-email/components");
	return (await render(jsx)).replace(/<!-- -->/g, "");
}

describe("@rox/email render smoke (all 12 templates)", () => {
	it("renders welcome (RU)", async () => {
		const { WelcomeEmail } = await import("../welcome");
		const html = await renderOf(<WelcomeEmail userName="Mark" />);
		expect(html).toContain("Добро пожаловать в Rox");
		expect(html).not.toContain("Welcome to Rox");
	});

	it("renders organization-invitation (RU)", async () => {
		const { OrganizationInvitationEmail } = await import(
			"../organization-invitation"
		);
		// Props spread from an object so the `role` prop isn't flagged by the
		// linter as an HTML ARIA role attribute.
		const html = await renderOf(
			<OrganizationInvitationEmail
				{...{
					organizationName: "Globex",
					inviterName: "Hank",
					inviteLink: "https://app.rox.one/x",
					role: "member",
					inviterEmail: "hank@globex.test",
					expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
				}}
			/>,
		);
		expect(html).toContain("Принять приглашение");
		expect(html).not.toContain("Accept Invitation");
	});

	it("renders member-added (RU)", async () => {
		const { MemberAddedEmail } = await import("../member-added");
		// Props spread from an object so the `role` prop isn't flagged by the
		// linter as an HTML ARIA role attribute.
		const html = await renderOf(
			<MemberAddedEmail
				{...{
					memberName: "Carl",
					organizationName: "Acme",
					role: "member",
					addedByName: "Homer",
				}}
			/>,
		);
		expect(html).toContain("Перейти в панель");
		expect(html).not.toContain("Go to Dashboard");
	});

	it("renders member-removed (RU)", async () => {
		const { MemberRemovedEmail } = await import("../member-removed");
		const html = await renderOf(
			<MemberRemovedEmail
				memberName="Carl"
				organizationName="Acme"
				removedByName="Homer"
			/>,
		);
		expect(html).toContain("Вас удалили из");
		expect(html).not.toContain("You've been removed");
	});

	it("renders integration-disconnected (RU)", async () => {
		const { IntegrationDisconnectedEmail } = await import(
			"../integration-disconnected"
		);
		const html = await renderOf(
			<IntegrationDisconnectedEmail recipientName="Satya" />,
		);
		expect(html).toContain("Открыть интеграции");
		expect(html).not.toContain("Open Integrations");
	});

	it("renders contact-inquiry (RU)", async () => {
		const { ContactInquiryEmail } = await import("../contact-inquiry");
		const html = await renderOf(
			<ContactInquiryEmail name="Ada" email="ada@test.com" message="Привет" />,
		);
		expect(html).toContain("Новое сообщение из формы контактов");
		expect(html).not.toContain("New Contact Message");
	});

	it("renders enterprise-inquiry (RU)", async () => {
		const { EnterpriseInquiryEmail } = await import("../enterprise-inquiry");
		const html = await renderOf(
			<EnterpriseInquiryEmail
				{...{
					name: "Jane",
					role: "CTO",
					company: "Acme",
					email: "jane@test.com",
				}}
			/>,
		);
		expect(html).toContain("Новый запрос Enterprise");
		expect(html).not.toContain("New Enterprise Inquiry");
	});

	// Deprecated Stripe seat-billing templates (D2): unwired, intentionally left
	// untranslated. Smoke-test render-without-throw only — no RU assertion.
	it("renders subscription-started (deprecated) without throwing", async () => {
		const { SubscriptionStartedEmail } = await import(
			"../subscription-started"
		);
		const html = await renderOf(
			<SubscriptionStartedEmail
				organizationName="Acme"
				planName="Pro"
				billingInterval="monthly"
				amount="$10.00"
				seatCount={1}
			/>,
		);
		expect(html.length).toBeGreaterThan(0);
	});

	it("renders subscription-cancelled (deprecated) without throwing", async () => {
		const { SubscriptionCancelledEmail } = await import(
			"../subscription-cancelled"
		);
		const html = await renderOf(
			<SubscriptionCancelledEmail
				organizationName="Acme"
				planName="Pro"
				accessEndsAt={new Date("2030-01-15T12:00:00Z")}
			/>,
		);
		expect(html.length).toBeGreaterThan(0);
	});

	it("renders payment-failed (deprecated) without throwing", async () => {
		const { PaymentFailedEmail } = await import("../payment-failed");
		const html = await renderOf(
			<PaymentFailedEmail
				organizationName="Acme"
				planName="Pro"
				amount="$10.00"
			/>,
		);
		expect(html.length).toBeGreaterThan(0);
	});

	it("renders member-added-billing (deprecated) without throwing", async () => {
		const { MemberAddedBillingEmail } = await import("../member-added-billing");
		const html = await renderOf(
			<MemberAddedBillingEmail
				organizationName="Acme"
				newMemberName="Jane"
				newMemberEmail="jane@test.com"
				addedByName="John"
				newSeatCount={5}
				newMonthlyTotal="$50.00"
			/>,
		);
		expect(html.length).toBeGreaterThan(0);
	});

	it("renders member-removed-billing (deprecated) without throwing", async () => {
		const { MemberRemovedBillingEmail } = await import(
			"../member-removed-billing"
		);
		const html = await renderOf(
			<MemberRemovedBillingEmail
				organizationName="Acme"
				removedMemberName="Jane"
				removedMemberEmail="jane@test.com"
				removedByName="John"
				newSeatCount={4}
				newMonthlyTotal="$40.00"
			/>,
		);
		expect(html.length).toBeGreaterThan(0);
	});

	it("renders the RU footer (tagline + legal labels) in a layout template", async () => {
		const { WelcomeEmail } = await import("../welcome");
		const html = await renderOf(<WelcomeEmail />);
		expect(html).toContain(
			"Запускайте десятки агентов Claude Code, Codex и других параллельно.",
		);
		expect(html).toContain("Конфиденциальность");
		expect(html).toContain("Все права защищены");
	});
});
