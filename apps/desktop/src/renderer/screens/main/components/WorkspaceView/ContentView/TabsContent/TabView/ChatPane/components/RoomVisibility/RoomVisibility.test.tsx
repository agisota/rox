import { describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RoomVisibilityRoom } from "./RoomVisibility";

/**
 * `RoomVisibilityRoom` is the live half of the desktop ChatPane visibility
 * mount: it opens the Liveblocks room and renders the private-vs-shared badge
 * derived from `useOthers()` via `@rox/collab`'s `deriveRoomVisibility`. We
 * inject fake Liveblocks bindings through props (no module mocking — fragile
 * across files under `bun test`), mirroring the proven desktop `ThreadPresence`
 * test, so the assertions exercise OUR wiring: the visibility derivation, the
 * member avatar stack, and the org-scoped room id.
 */
describe("RoomVisibilityRoom (desktop ChatPane)", () => {
	const noopAuth = async () => ({ token: "t" });

	function FakeRoomProvider({
		roomId,
		children,
	}: {
		roomId: string;
		authEndpoint: (roomId: string) => Promise<{ token: string }>;
		children: ReactNode;
	}) {
		return <div data-room-id={roomId}>{children}</div>;
	}

	test("renders the private lock glyph when no other peers are present", () => {
		const html = renderToStaticMarkup(
			<RoomVisibilityRoom
				roomId="org:org_1:dashboard:session_1"
				authEndpoint={noopAuth}
				RoomProvider={FakeRoomProvider}
				useOthers={() => []}
			/>,
		);
		expect(html).toContain('data-visibility="private"');
		expect(html).toContain('data-slot="lock-glyph"');
		expect(html).toContain('data-room-id="org:org_1:dashboard:session_1"');
	});

	test("renders the shared badge + member avatars when peers are present", () => {
		const html = renderToStaticMarkup(
			<RoomVisibilityRoom
				roomId="org:org_1:dashboard:session_1"
				authEndpoint={noopAuth}
				RoomProvider={FakeRoomProvider}
				useOthers={() => [
					{ connectionId: 1, info: { name: "Ada", avatarUrl: null } },
					{ connectionId: 2, info: { name: "Linus", avatarUrl: null } },
				]}
			/>,
		);
		expect(html).toContain('data-visibility="shared"');
		const avatars = html.split('data-slot="presence-avatar"').length - 1;
		expect(avatars).toBe(2);
	});

	test("explicitlyShared forces the shared badge even with no live peers", () => {
		const html = renderToStaticMarkup(
			<RoomVisibilityRoom
				roomId="org:org_1:dashboard:session_1"
				authEndpoint={noopAuth}
				explicitlyShared
				RoomProvider={FakeRoomProvider}
				useOthers={() => []}
			/>,
		);
		expect(html).toContain('data-visibility="shared"');
		expect(html).not.toContain('data-slot="lock-glyph"');
	});
});
