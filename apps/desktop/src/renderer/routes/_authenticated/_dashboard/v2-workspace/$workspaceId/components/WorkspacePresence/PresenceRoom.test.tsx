import { describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PresenceRoom } from "./PresenceRoom";

/**
 * `PresenceRoom` is the live half of the desktop workspace presence mount: it
 * opens the Liveblocks room and feeds `useOthers()` into the shared
 * `PresenceStack`. We inject fake Liveblocks bindings via props (no module
 * mocking — fragile across files under `bun test`) so the test asserts our
 * wiring: the org-scoped room id and the peer→avatar mapping.
 */
describe("PresenceRoom (desktop)", () => {
	test("opens the scoped room and renders one avatar per other peer", () => {
		const captured: { roomId?: string } = {};

		const FakeRoomProvider = ({
			roomId,
			children,
		}: {
			roomId: string;
			authEndpoint: (roomId: string) => Promise<{ token: string }>;
			children: ReactNode;
		}) => {
			captured.roomId = roomId;
			return <div data-room-id={roomId}>{children}</div>;
		};

		const fakeUseOthers = () => [
			{ connectionId: 1, info: { name: "Ada", avatarUrl: null } },
			{
				connectionId: 2,
				info: { name: "Linus", avatarUrl: "https://example.test/l.png" },
			},
		];

		const html = renderToStaticMarkup(
			<PresenceRoom
				RoomProvider={FakeRoomProvider}
				authEndpoint={async () => ({ token: "t" })}
				roomId="org:org_1:dashboard:ws_1"
				useOthers={fakeUseOthers}
			/>,
		);

		// the room boundary received our org-scoped id
		expect(captured.roomId).toBe("org:org_1:dashboard:ws_1");
		// PresenceStack rendered both peers as avatars
		const avatarCount = html.split('data-slot="presence-avatar"').length - 1;
		expect(avatarCount).toBe(2);
		expect(html).toContain("Ada");
		expect(html).toContain("Linus");
	});

	test("falls back to a guest label when a peer has no info", () => {
		const html = renderToStaticMarkup(
			<PresenceRoom
				RoomProvider={({ children }) => <>{children}</>}
				authEndpoint={async () => ({ token: "t" })}
				roomId="org:org_1:dashboard:ws_1"
				useOthers={() => [{ connectionId: 9, info: null }]}
			/>,
		);

		expect(html).toContain("Гость");
	});

	test("renders an empty stack (no avatars) when no peers are present", () => {
		const html = renderToStaticMarkup(
			<PresenceRoom
				RoomProvider={({ children }) => <>{children}</>}
				authEndpoint={async () => ({ token: "t" })}
				roomId="org:org_1:dashboard:ws_1"
				useOthers={() => []}
			/>,
		);

		const avatarCount = html.split('data-slot="presence-avatar"').length - 1;
		expect(avatarCount).toBe(0);
		// the breathing "live" dot only shows when peers are present
		expect(html).not.toContain('data-slot="presence-live"');
	});
});
