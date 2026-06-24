import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Capture what the LiveBlocks providers are rendered with, without pulling in
 * the real SDK (which would try to talk to the LiveBlocks cloud). We mock
 * `@liveblocks/react` at the module boundary so the test asserts our wiring,
 * not LiveBlocks internals.
 */
const captured: {
	roomId?: string;
	authEndpoint?: (roomId: string) => Promise<{ token: string }>;
} = {};

mock.module("@liveblocks/react", () => ({
	LiveblocksProvider: ({
		children,
		authEndpoint,
	}: {
		children: unknown;
		authEndpoint: (roomId: string) => Promise<{ token: string }>;
	}) => {
		captured.authEndpoint = authEndpoint;
		return <div data-testid="lb-provider">{children as never}</div>;
	},
	RoomProvider: ({ id, children }: { id: string; children: unknown }) => {
		captured.roomId = id;
		return (
			<div data-testid="room" data-room-id={id}>
				{children as never}
			</div>
		);
	},
	useOthers: () => [],
	useMyPresence: () => [{ cursor: null, selectedEntryId: null }, () => {}],
	useStorage: () => null,
	useRoom: () => ({}),
}));

const { RoxRoomProvider } = await import("./client");

describe("RoxRoomProvider", () => {
	test("passes the resolved roomId to RoomProvider", () => {
		const html = renderToStaticMarkup(
			<RoxRoomProvider
				roomId="org:org_1:dashboard:dash_1"
				authEndpoint={async () => ({ token: "t" })}
			>
				<span>child</span>
			</RoxRoomProvider>,
		);
		expect(html).toContain('data-room-id="org:org_1:dashboard:dash_1"');
		expect(html).toContain("child");
		expect(captured.roomId).toBe("org:org_1:dashboard:dash_1");
	});

	test("wires authEndpoint through to LiveblocksProvider and calls it once", async () => {
		const authEndpoint = mock(async (_room: string) => ({ token: "minted" }));
		renderToStaticMarkup(
			<RoxRoomProvider
				roomId="org:org_2:dashboard:dash_9"
				authEndpoint={authEndpoint}
			>
				<span>child</span>
			</RoxRoomProvider>,
		);
		expect(captured.authEndpoint).toBeDefined();
		// LiveBlocks invokes the auth callback with the room id; assert it forwards.
		const result = await captured.authEndpoint?.("org:org_2:dashboard:dash_9");
		expect(result).toEqual({ token: "minted" });
		expect(authEndpoint).toHaveBeenCalledTimes(1);
		expect(authEndpoint).toHaveBeenCalledWith("org:org_2:dashboard:dash_9");
	});
});
