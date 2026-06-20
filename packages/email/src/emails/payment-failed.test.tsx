import { describe, expect, it } from "bun:test";

// Uses StandardLayout -> Footer (needs NEXT_PUBLIC_MARKETING_URL at eval time).
// Pure render only; no network / Resend.
process.env.NEXT_PUBLIC_MARKETING_URL = "https://rox.one";

async function renderPaymentFailed(
	props: Parameters<typeof import("./payment-failed").PaymentFailedEmail>[0],
) {
	const { render } = await import("@react-email/components");
	const { PaymentFailedEmail } = await import("./payment-failed");
	const html = await render(<PaymentFailedEmail {...props} />);
	// Strip React's `<!-- -->` text-segment markers around interpolations.
	return html.replace(/<!-- -->/g, "");
}

const base = {
	ownerName: "Monty",
	organizationName: "Burns LLC",
	planName: "Enterprise",
	amount: "$99.00",
};

describe("PaymentFailedEmail", () => {
	it("renders the failed amount, org, and plan", async () => {
		const html = await renderPaymentFailed(base);
		expect(html).toContain("Payment failed");
		expect(html).toContain("Hi Monty,");
		expect(html).toContain("$99.00");
		expect(html).toContain("Burns LLC");
		expect(html).toContain("Enterprise");
	});

	it("falls back to 'there' when ownerName is null", async () => {
		const html = await renderPaymentFailed({ ...base, ownerName: null });
		expect(html).toContain("Hi there,");
	});

	it("shows the retry copy when nextRetryDate is present", async () => {
		const html = await renderPaymentFailed({
			...base,
			nextRetryDate: new Date("2030-02-01T00:00:00Z"),
		});
		// Apostrophes are HTML-escaped in the output, so assert on a fragment
		// without one.
		expect(html).toContain("automatically retry the payment");
	});

	it("hides the retry copy when nextRetryDate is null", async () => {
		const html = await renderPaymentFailed({ ...base, nextRetryDate: null });
		expect(html).not.toContain("automatically retry the payment");
	});

	it("renders an Update Payment Method CTA only with a billing portal URL", async () => {
		const withUrl = await renderPaymentFailed({
			...base,
			billingPortalUrl: "https://billing.rox.one/portal",
		});
		expect(withUrl).toContain("Update Payment Method");
		expect(withUrl).toContain("https://billing.rox.one/portal");

		const withoutUrl = await renderPaymentFailed(base);
		expect(withoutUrl).not.toContain("https://billing.rox.one/portal");
	});
});
