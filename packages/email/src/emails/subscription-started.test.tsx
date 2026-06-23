import { describe, expect, it } from "bun:test";

// Uses StandardLayout -> Footer (needs NEXT_PUBLIC_MARKETING_URL at eval time).
// Pure render only; no network / Resend.
process.env.NEXT_PUBLIC_MARKETING_URL = "https://rox.one";

async function renderStarted(
	props: Parameters<
		typeof import("./subscription-started").SubscriptionStartedEmail
	>[0],
) {
	const { render } = await import("@react-email/components");
	const { SubscriptionStartedEmail } = await import("./subscription-started");
	const html = await render(<SubscriptionStartedEmail {...props} />);
	// Strip React's `<!-- -->` text-segment markers around interpolations.
	return html.replace(/<!-- -->/g, "");
}

const base = {
	ownerName: "Ned",
	organizationName: "Flanders Org",
	planName: "Pro",
	billingInterval: "monthly" as const,
	amount: "$10.00",
	seatCount: 3,
};

describe("SubscriptionStartedEmail", () => {
	it("renders owner, org, plan, amount, and seats", async () => {
		const html = await renderStarted(base);
		expect(html).toContain("Hi Ned,");
		expect(html).toContain("Flanders Org");
		expect(html).toContain("Pro");
		expect(html).toContain("$10.00");
		expect(html).toContain("3");
	});

	it("renders 'month' interval text for monthly billing", async () => {
		const html = await renderStarted({ ...base, billingInterval: "monthly" });
		expect(html).toContain("$10.00/month");
	});

	it("renders 'year' interval text for yearly billing", async () => {
		const html = await renderStarted({
			...base,
			billingInterval: "yearly",
			amount: "$100.00",
		});
		expect(html).toContain("$100.00/year");
	});

	it("falls back to 'there' when ownerName is null", async () => {
		const html = await renderStarted({ ...base, ownerName: null });
		expect(html).toContain("Hi there,");
	});
});
