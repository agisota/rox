import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { PresenceUser } from "../PresenceStack/PresenceStack";
import { RoomVisibilityBadge } from "./RoomVisibilityBadge";

function makeMembers(n: number): PresenceUser[] {
	return Array.from({ length: n }, (_, i) => ({
		id: `u${i}`,
		name: `User ${i}`,
		avatarUrl: null,
	}));
}

describe("RoomVisibilityBadge", () => {
	it("renders a lock glyph for a private room", () => {
		const html = renderToStaticMarkup(
			<RoomVisibilityBadge visibility="private" />,
		);
		expect(html).toContain('data-visibility="private"');
		expect(html).toContain('data-slot="lock-glyph"');
		expect(html).not.toContain('data-slot="presence-avatar"');
	});

	it("renders the shared indicator and a member avatar stack for a shared room", () => {
		const html = renderToStaticMarkup(
			<RoomVisibilityBadge visibility="shared" members={makeMembers(3)} />,
		);
		expect(html).toContain('data-visibility="shared"');
		expect(html).toContain('data-slot="shared-indicator"');
		const avatars = html.split('data-slot="presence-avatar"').length - 1;
		expect(avatars).toBe(3);
		expect(html).not.toContain('data-slot="lock-glyph"');
	});

	it("renders the shared indicator without a stack when no members are present", () => {
		const html = renderToStaticMarkup(
			<RoomVisibilityBadge visibility="shared" />,
		);
		expect(html).toContain('data-slot="shared-indicator"');
		expect(html).not.toContain('data-slot="presence-avatar"');
	});

	it("collapses member overflow beyond maxAvatars into a +N chip", () => {
		const html = renderToStaticMarkup(
			<RoomVisibilityBadge
				visibility="shared"
				members={makeMembers(7)}
				maxAvatars={5}
			/>,
		);
		const avatars = html.split('data-slot="presence-avatar"').length - 1;
		expect(avatars).toBe(5);
		expect(html).toContain("+2");
	});

	it("exposes accessible labels", () => {
		const priv = renderToStaticMarkup(
			<RoomVisibilityBadge visibility="private" privateLabel="Приватный" />,
		);
		expect(priv).toContain('aria-label="Приватный"');
		const shared = renderToStaticMarkup(
			<RoomVisibilityBadge visibility="shared" sharedLabel="Общий" />,
		);
		expect(shared).toContain('aria-label="Общий"');
	});
});
