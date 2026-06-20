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

	it("maps the member role to the Russian Member display label", async () => {
		const html = await renderInvitation({ ...base, role: "member" });
		expect(html).toContain("Участник");
	});

	it("maps a non-member role to the Russian Admin display label", async () => {
		const html = await renderInvitation({ ...base, role: "admin" });
		expect(html).toContain("Администратор");
	});

	it("greets the invitee by name in Russian when provided", async () => {
		const html = await renderInvitation({ ...base, inviteeName: "Marge" });
		expect(html).toContain("Здравствуйте, Marge!");
	});

	it("renders the Russian Accept Invitation CTA", async () => {
		const html = await renderInvitation(base);
		expect(html).toContain("Принять приглашение");
		expect(html).not.toContain("Accept Invitation");
	});

	it("pluralizes the expiration window for multiple days in Russian", async () => {
		const html = await renderInvitation({
			...base,
			expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 60_000),
		});
		expect(html).toContain("истекает через 5 дн.");
	});

	it("uses the singular day form when exactly one day remains", async () => {
		const html = await renderInvitation({
			...base,
			expiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000 + 60_000),
		});
		expect(html).toContain("истекает через 1 день");
		expect(html).not.toContain("истекает через 1 дн.");
	});
});
