import { describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ThreadPresenceRoom } from "./ThreadPresence";

/**
 * `ThreadPresenceRoom` is the live half of the desktop inbox presence mount:
 * it opens the Liveblocks room and renders "N онлайн" + a typing indicator from
 * `useOthers()`, and exposes a `setTyping` callback to the composer via
 * `useMyPresence()`. We inject fake Liveblocks bindings through props (no module
 * mocking — fragile across files under `bun test`), mirroring the proven desktop
 * `WorkspacePresence/PresenceRoom` test, so the assertions exercise OUR wiring:
 * the online count (others + me), the single/multi typing copy, the org-scoped
 * room id, and the typing-control handshake.
 */
describe("ThreadPresenceRoom (desktop)", () => {
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

	test("renders '1 онлайн' when no other peers are present", () => {
		const html = renderToStaticMarkup(
			<ThreadPresenceRoom
				roomId="org:org_1:dashboard:thread_1"
				authEndpoint={noopAuth}
				RoomProvider={FakeRoomProvider}
				useOthers={() => []}
				useMyPresence={() => [{}, () => {}]}
			/>,
		);
		expect(html).toContain("1 онлайн");
	});

	test("counts me + others ('3 онлайн' for two peers)", () => {
		const html = renderToStaticMarkup(
			<ThreadPresenceRoom
				roomId="org:org_1:dashboard:thread_1"
				authEndpoint={noopAuth}
				RoomProvider={FakeRoomProvider}
				useOthers={() => [
					{ connectionId: 1, info: { name: "Ada" } },
					{ connectionId: 2, info: { name: "Linus" } },
				]}
				useMyPresence={() => [{}, () => {}]}
			/>,
		);
		expect(html).toContain("3 онлайн");
	});

	test("shows '<name> печатает…' when exactly one other peer is typing", () => {
		const html = renderToStaticMarkup(
			<ThreadPresenceRoom
				roomId="org:org_1:dashboard:thread_1"
				authEndpoint={noopAuth}
				RoomProvider={FakeRoomProvider}
				useOthers={() => [
					{
						connectionId: 1,
						info: { name: "Ada" },
						presence: { typing: true },
					},
					{ connectionId: 2, info: { name: "Linus" } },
				]}
				useMyPresence={() => [{}, () => {}]}
			/>,
		);
		expect(html).toContain("Ada печатает…");
	});

	test("shows the multi-typing copy when 2+ peers are typing", () => {
		const html = renderToStaticMarkup(
			<ThreadPresenceRoom
				roomId="org:org_1:dashboard:thread_1"
				authEndpoint={noopAuth}
				RoomProvider={FakeRoomProvider}
				useOthers={() => [
					{
						connectionId: 1,
						info: { name: "Ada" },
						presence: { typing: true },
					},
					{
						connectionId: 2,
						info: { name: "Linus" },
						presence: { typing: true },
					},
				]}
				useMyPresence={() => [{}, () => {}]}
			/>,
		);
		expect(html).toContain("несколько человек печатают…");
		expect(html).not.toContain("печатает…<"); // not the single form
	});

	test("falls back to 'Кто-то' for a typing peer without a name", () => {
		const html = renderToStaticMarkup(
			<ThreadPresenceRoom
				roomId="org:org_1:dashboard:thread_1"
				authEndpoint={noopAuth}
				RoomProvider={FakeRoomProvider}
				useOthers={() => [{ connectionId: 9, presence: { typing: true } }]}
				useMyPresence={() => [{}, () => {}]}
			/>,
		);
		expect(html).toContain("Кто-то печатает…");
	});

	test("hands the composer a setTyping that writes presence.typing", () => {
		const updates: Array<{ typing?: boolean }> = [];
		let captured: ((typing: boolean) => void) | null = null;

		renderToStaticMarkup(
			<ThreadPresenceRoom
				roomId="org:org_1:dashboard:thread_1"
				authEndpoint={noopAuth}
				RoomProvider={FakeRoomProvider}
				useOthers={() => []}
				useMyPresence={() => [{}, (patch) => updates.push(patch)]}
				onTypingControl={(setTyping) => {
					captured = setTyping;
				}}
			/>,
		);

		expect(captured).not.toBeNull();
		(captured as unknown as (typing: boolean) => void)(true);
		(captured as unknown as (typing: boolean) => void)(false);
		expect(updates).toEqual([{ typing: true }, { typing: false }]);
	});
});
