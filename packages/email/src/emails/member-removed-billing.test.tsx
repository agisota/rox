import { describe, expect, it } from "bun:test";

// Uses StandardLayout -> Footer (needs NEXT_PUBLIC_MARKETING_URL at eval time).
// Pure render only; no network / Resend.
process.env.NEXT_PUBLIC_MARKETING_URL = "https://rox.one";

// This template is @deprecated (Stripe seat-billing retired for the Rox token
// economy) and unwired. We only smoke-test that it still renders without
// throwing — no RU-content assertion, since the deprecated copy is intentionally
// left untranslated until/unless a token-economy email replaces it.
async function renderMemberRemovedBilling() {
	const { render } = await import("@react-email/components");
	const { MemberRemovedBillingEmail } = await import(
		"./member-removed-billing"
	);
	return render(
		<MemberRemovedBillingEmail
			organizationName="Acme"
			removedMemberName="Jane"
			removedMemberEmail="jane@test.com"
			removedByName="John"
			newSeatCount={4}
			newMonthlyTotal="$40.00"
		/>,
	);
}

describe("MemberRemovedBillingEmail (deprecated)", () => {
	it("renders to a non-empty HTML string without throwing", async () => {
		const html = await renderMemberRemovedBilling();
		expect(typeof html).toBe("string");
		expect(html.length).toBeGreaterThan(0);
	});
});
