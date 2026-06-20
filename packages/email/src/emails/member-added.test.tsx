import { describe, expect, it } from "bun:test";

// Uses StandardLayout -> Footer (needs NEXT_PUBLIC_MARKETING_URL at eval time).
// Pure render only; no network / Resend.
process.env.NEXT_PUBLIC_MARKETING_URL = "https://rox.one";

async function renderMemberAdded(
	props: Parameters<typeof import("./member-added").MemberAddedEmail>[0],
) {
	const { render } = await import("@react-email/components");
	const { MemberAddedEmail } = await import("./member-added");
	const html = await render(<MemberAddedEmail {...props} />);
	// Strip React's `<!-- -->` text-segment markers around interpolations.
	return html.replace(/<!-- -->/g, "");
}

const base = {
	memberName: "Carl",
	organizationName: "Nuclear Plant",
	role: "member",
	addedByName: "Homer Simpson",
};

describe("MemberAddedEmail", () => {
	it("renders org, inviter, and Russian member greeting", async () => {
		const html = await renderMemberAdded(base);
		expect(html).toContain("Nuclear Plant");
		expect(html).toContain("Homer Simpson");
		expect(html).toContain("Здравствуйте, Carl!");
		expect(html).toContain("Перейти в панель");
		expect(html).not.toContain("Go to Dashboard");
	});

	it("maps role 'member' to the Russian Member label", async () => {
		const html = await renderMemberAdded({ ...base, role: "member" });
		expect(html).toContain("Участник");
	});

	it("maps role 'admin' to the Russian Admin label", async () => {
		const html = await renderMemberAdded({ ...base, role: "admin" });
		expect(html).toContain("Администратор");
	});

	it("maps any other role to the Russian Owner label", async () => {
		const html = await renderMemberAdded({ ...base, role: "owner" });
		expect(html).toContain("Владелец");
	});

	it("falls back to the Russian default greeting when memberName is null", async () => {
		const html = await renderMemberAdded({ ...base, memberName: null });
		expect(html).toContain("Здравствуйте!");
	});
});
