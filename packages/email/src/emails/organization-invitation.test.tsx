import { describe, expect, it } from "bun:test";

// Uses StandardLayout -> Footer (needs NEXT_PUBLIC_MARKETING_URL at eval time).
// Pure render only; no network / Resend.
process.env.NEXT_PUBLIC_MARKETING_URL = "https://rox.one";

async function renderInvitation(
	props: Parameters<
		typeof import("./organization-invitation").OrganizationInvitationEmail
	>[0],
) {
	const { render } = await import("@react-email/components");
	const { OrganizationInvitationEmail } = await import(
		"./organization-invitation"
	);
	const html = await render(<OrganizationInvitationEmail {...props} />);
	// Strip React's `<!-- -->` text-segment markers around interpolations.
	return html.replace(/<!-- -->/g, "");
}

const base = {
	organizationName: "Globex",
	inviterName: "Hank Scorpio",
	inviteLink: "https://app.rox.one/accept-invitation/42?token=xyz",
	role: "member",
	inviterEmail: "hank@globex.example",
	expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
};

describe("OrganizationInvitationEmail", () => {
	it("renders organization, inviter, and invite link", async () => {
		const html = await renderInvitation(base);
		expect(html).toContain("Globex");
		expect(html).toContain("Hank Scorpio");
		expect(html).toContain("hank@globex.example");
		expect(html).toContain(
			"https://app.rox.one/accept-invitation/42?token=xyz",
		);
	});

	it("maps the member role to the Member display label", async () => {
		const html = await renderInvitation({ ...base, role: "member" });
		expect(html).toContain("Member");
	});

	it("maps a non-member role to the Admin display label", async () => {
		const html = await renderInvitation({ ...base, role: "admin" });
		expect(html).toContain("Admin");
	});

	it("greets the invitee by name when provided", async () => {
		const html = await renderInvitation({ ...base, inviteeName: "Marge" });
		expect(html).toContain("Hi Marge,");
	});

	it("pluralizes the expiration window for multiple days", async () => {
		const html = await renderInvitation({
			...base,
			expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 60_000),
		});
		expect(html).toContain("expires in 5 days");
	});

	it("uses the singular day form when exactly one day remains", async () => {
		const html = await renderInvitation({
			...base,
			expiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000 + 60_000),
		});
		expect(html).toContain("expires in 1 day");
		expect(html).not.toContain("expires in 1 days");
	});
});
