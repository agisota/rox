import { describe, expect, it } from "bun:test";

// Uses StandardLayout -> Footer (needs NEXT_PUBLIC_MARKETING_URL at eval time).
// Pure render only; no network / Resend.
process.env.NEXT_PUBLIC_MARKETING_URL = "https://rox.one";

async function renderCancelled(
	props: Parameters<
		typeof import("./subscription-cancelled").SubscriptionCancelledEmail
	>[0],
) {
	const { render } = await import("@react-email/components");
	const { SubscriptionCancelledEmail } = await import(
		"./subscription-cancelled"
	);
	const html = await render(<SubscriptionCancelledEmail {...props} />);
	// Strip React's `<!-- -->` text-segment markers around interpolations.
	return html.replace(/<!-- -->/g, "");
}

const base = {
	ownerName: "Lisa",
	organizationName: "Springfield Co",
	planName: "Pro",
	// Use a fixed UTC date to keep the formatted output deterministic.
	accessEndsAt: new Date("2030-01-15T12:00:00Z"),
};

describe("SubscriptionCancelledEmail", () => {
	it("renders the owner, org, and plan", async () => {
		const html = await renderCancelled(base);
		expect(html).toContain("Hi Lisa,");
		expect(html).toContain("Springfield Co");
		expect(html).toContain("Pro");
		expect(html).toContain("Subscription cancelled");
	});

	it("formats the access-ends date as a human-readable string", async () => {
		const html = await renderCancelled(base);
		// date-fns format(..., "MMMM d, yyyy")
		expect(html).toContain("January 15, 2030");
	});

	it("falls back to 'there' when ownerName is null", async () => {
		const html = await renderCancelled({ ...base, ownerName: null });
		expect(html).toContain("Hi there,");
	});

	it("renders a Resubscribe CTA only when a billing portal URL is given", async () => {
		const withUrl = await renderCancelled({
			...base,
			billingPortalUrl: "https://billing.rox.one/portal",
		});
		expect(withUrl).toContain("Resubscribe");
		expect(withUrl).toContain("https://billing.rox.one/portal");

		const withoutUrl = await renderCancelled(base);
		expect(withoutUrl).not.toContain("https://billing.rox.one/portal");
	});
});
