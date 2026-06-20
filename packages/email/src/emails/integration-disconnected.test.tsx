import { describe, expect, it } from "bun:test";

// Uses StandardLayout -> Footer (needs NEXT_PUBLIC_MARKETING_URL at eval time).
// Pure render only; no network / Resend.
process.env.NEXT_PUBLIC_MARKETING_URL = "https://rox.one";

async function renderDisconnected(
	props: Parameters<
		typeof import("./integration-disconnected").IntegrationDisconnectedEmail
	>[0],
) {
	const { render } = await import("@react-email/components");
	const { IntegrationDisconnectedEmail } = await import(
		"./integration-disconnected"
	);
	const html = await render(<IntegrationDisconnectedEmail {...props} />);
	// Strip React's `<!-- -->` text-segment markers around interpolations.
	return html.replace(/<!-- -->/g, "");
}

const single = [
	{
		orgName: "Acme Inc",
		workspaceName: "Acme",
		provider: "Linear" as const,
		winnerEmail: "owner@acme.com",
	},
];

const multi = [
	...single,
	{
		orgName: "Beta LLC",
		workspaceName: "Beta",
		provider: "Slack" as const,
		winnerEmail: "owner@beta.com",
	},
];

describe("IntegrationDisconnectedEmail", () => {
	it("renders the Russian heading and recipient greeting", async () => {
		const html = await renderDisconnected({
			recipientName: "Satya",
			connections: single,
		});
		expect(html).toContain("Интеграция Rox была отключена");
		expect(html).toContain("Здравствуйте, Satya!");
		expect(html).not.toContain("A Rox integration was disconnected");
	});

	it("falls back to the Russian default greeting when recipientName is null", async () => {
		const html = await renderDisconnected({
			recipientName: null,
			connections: single,
		});
		expect(html).toContain("Здравствуйте!");
	});

	it("uses the singular connection phrasing for one connection", async () => {
		const html = await renderDisconnected({ connections: single });
		expect(html).toContain("Следующее подключение было отключено:");
		expect(html).toContain("owner@acme.com");
	});

	it("uses the plural connection phrasing for multiple connections", async () => {
		const html = await renderDisconnected({ connections: multi });
		expect(html).toContain("Следующие подключения были отключены:");
		expect(html).toContain("Beta LLC");
	});

	it("renders the Russian Open Integrations CTA", async () => {
		const html = await renderDisconnected({ connections: single });
		expect(html).toContain("Открыть интеграции");
		expect(html).not.toContain("Open Integrations");
	});
});
