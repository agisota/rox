import { describe, expect, it } from "bun:test";

// Uses StandardLayout -> Footer (needs NEXT_PUBLIC_MARKETING_URL at eval time).
// Pure render only; no network / Resend.
process.env.NEXT_PUBLIC_MARKETING_URL = "https://rox.one";

async function renderMemberRemoved(
	props: Parameters<typeof import("./member-removed").MemberRemovedEmail>[0],
) {
	const { render } = await import("@react-email/components");
	const { MemberRemovedEmail } = await import("./member-removed");
	const html = await render(<MemberRemovedEmail {...props} />);
	// Strip React's `<!-- -->` text-segment markers around interpolations.
	return html.replace(/<!-- -->/g, "");
}

const base = {
	memberName: "Carl",
	organizationName: "Nuclear Plant",
	removedByName: "Homer Simpson",
};

describe("MemberRemovedEmail", () => {
	it("renders org, remover, and Russian member greeting", async () => {
		const html = await renderMemberRemoved(base);
		expect(html).toContain("Nuclear Plant");
		expect(html).toContain("Homer Simpson");
		expect(html).toContain("Здравствуйте, Carl!");
		expect(html).toContain("Вас удалили из");
		expect(html).not.toContain("You've been removed");
	});

	it("falls back to the Russian default greeting when memberName is null", async () => {
		const html = await renderMemberRemoved({ ...base, memberName: null });
		expect(html).toContain("Здравствуйте!");
	});
});
