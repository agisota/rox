import { describe, expect, it } from "bun:test";

// Uses StandardLayout -> Footer (needs NEXT_PUBLIC_MARKETING_URL at eval time).
// Pure render only; no network / Resend.
process.env.NEXT_PUBLIC_MARKETING_URL = "https://rox.one";

// This template is @deprecated (Stripe seat-billing retired for the Rox token
// economy) and unwired. We only smoke-test that it still renders without
// throwing — no RU-content assertion, since the deprecated copy is intentionally
// left untranslated until/unless a token-economy email replaces it.
async function renderMemberAddedBilling() {
	const { render } = await import("@react-email/components");
	const { MemberAddedBillingEmail } = await import("./member-added-billing");
	return render(
		<MemberAddedBillingEmail
			organizationName="Acme"
			newMemberName="Jane"
			newMemberEmail="jane@test.com"
			addedByName="John"
			newSeatCount={5}
			newMonthlyTotal="$50.00"
		/>,
	);
}

describe("MemberAddedBillingEmail (deprecated)", () => {
	it("renders to a non-empty HTML string without throwing", async () => {
		const html = await renderMemberAddedBilling();
		expect(typeof html).toBe("string");
		expect(html.length).toBeGreaterThan(0);
	});
});
