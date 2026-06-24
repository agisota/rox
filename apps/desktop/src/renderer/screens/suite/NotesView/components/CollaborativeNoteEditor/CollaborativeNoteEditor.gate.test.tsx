import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type {
	ExperimentalFeatureId,
	ExperimentalFeatureState,
} from "@rox/shared/experimental-features";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Desktop co-editing parity for `collaboration.editor`: the note editor must
 * select the COLLABORATIVE path only when the experiment is open AND an org
 * scopes the room, and otherwise stay byte-for-byte single-player. This suite
 * proves the gate-driven PATH SELECTION + the reused room id, NOT the CRDT core
 * (that is covered server-free by `@rox/collab` `yjs.test.ts` /
 * `yjs-binding.test.ts`).
 *
 *   • gate open + active org → mounts the Liveblocks room with the EXACT shared
 *     id `org:{orgId}:note:{noteId}` (the same room web's NoteEditor opens), so
 *     desktop and web edit the same shared document, and the collaborative
 *     affordance ("Совместное редактирование") surfaces with peers, while
 *   • gate closed (`needs_configuration` / disabled) OR no active org → renders
 *     the plain controlled textarea, never mounts a room → ZERO regression.
 *
 * We drive the gate by mocking its data source (`useExperimentalFeature`) and the
 * app-internal auth/cloud-tRPC singletons (NOT shared barrels), and inject fake
 * Liveblocks bindings via props, so the assertion exercises OUR wiring, never the
 * real Liveblocks cloud. `createNoteYjsBinding` is invoked from an effect, which a
 * static render never runs, so no live socket is opened here.
 */

let featureState: ExperimentalFeatureState = makeState("available", true);
let activeOrganizationId: string | null = "org_1";
let capturedRoomId: string | undefined;

function makeState(
	availability: ExperimentalFeatureState["availability"],
	enabled: boolean,
): ExperimentalFeatureState {
	return {
		id: "collaboration.editor" as ExperimentalFeatureId,
		enabled,
		defaultEnabled: true,
		userOverride: null,
		availability,
		dependencies: [],
	};
}

mock.module("renderer/hooks/useExperimentalFeature", () => ({
	useExperimentalFeature: () => ({
		state: featureState,
		isLoading: false,
		refetch: async () => undefined,
	}),
}));

mock.module("renderer/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ data: { session: { activeOrganizationId } } }),
	},
	getAuthToken: () => null,
}));

mock.module("renderer/lib/api-trpc-client", () => ({
	apiTrpcClient: {
		collab: { authRoom: { mutate: async () => ({ token: "t" }) } },
	},
}));

// A fake room boundary that records the room id the editor scopes (the genuine
// cross-platform-coediting signal), plus a stubbed `useRoom`/`useOthers` so the
// collaborative textarea renders without the real Liveblocks client.
const FakeRoomProvider = ({
	roomId,
	children,
}: {
	roomId: string;
	authEndpoint: (roomId: string) => Promise<{ token: string }>;
	children: ReactNode;
}) => {
	capturedRoomId = roomId;
	return <div data-room-id={roomId}>{children}</div>;
};
const fakeUseRoom = () => ({}) as never;
const fakeUseOthers = () => [{ connectionId: 1 }];

const { CollaborativeNoteEditor } = await import("./CollaborativeNoteEditor");

afterAll(() => {
	mock.restore();
});

beforeEach(() => {
	featureState = makeState("available", true);
	activeOrganizationId = "org_1";
	capturedRoomId = undefined;
});

const NOTE = "00000000-0000-0000-0000-0000000000bb";

describe("CollaborativeNoteEditor (desktop gate)", () => {
	test("mounts the collaborative room with the shared note room id when open + org-scoped", () => {
		const html = renderToStaticMarkup(
			<CollaborativeNoteEditor
				noteId={NOTE}
				value="shared body"
				onChange={() => {}}
				RoomProvider={FakeRoomProvider}
				useRoom={fakeUseRoom}
				useOthers={fakeUseOthers}
			/>,
		);
		// REUSES the same room id web opens, so desktop+web edit the same document.
		expect(capturedRoomId).toBe(`org:org_1:note:${NOTE}`);
		// The collaborative textarea is mounted with the current value...
		expect(html).toContain("shared body");
		expect(html).toContain("Текст заметки в формате Markdown");
		// ...and the collaborative-only affordance surfaces (me + 1 peer).
		expect(html).toContain("Совместное редактирование");
	});

	test("stays single-player (no room) when the experiment is not configured", () => {
		featureState = makeState("needs_configuration", true);
		const html = renderToStaticMarkup(
			<CollaborativeNoteEditor
				noteId={NOTE}
				value="single player body"
				onChange={() => {}}
				RoomProvider={FakeRoomProvider}
				useRoom={fakeUseRoom}
				useOthers={fakeUseOthers}
			/>,
		);
		expect(capturedRoomId).toBeUndefined();
		expect(html).toContain("single player body");
		expect(html).toContain("Текст заметки в формате Markdown");
		// No room was mounted → the collaborative affordance is absent.
		expect(html).not.toContain("Совместное редактирование");
	});

	test("stays single-player (no room) when disabled via override", () => {
		featureState = makeState("available", false);
		const html = renderToStaticMarkup(
			<CollaborativeNoteEditor
				noteId={NOTE}
				value="single player body"
				onChange={() => {}}
				RoomProvider={FakeRoomProvider}
				useRoom={fakeUseRoom}
				useOthers={fakeUseOthers}
			/>,
		);
		expect(capturedRoomId).toBeUndefined();
		expect(html).not.toContain("Совместное редактирование");
	});

	test("stays single-player (no room) when there is no active organization to scope the room", () => {
		activeOrganizationId = null;
		const html = renderToStaticMarkup(
			<CollaborativeNoteEditor
				noteId={NOTE}
				value="single player body"
				onChange={() => {}}
				RoomProvider={FakeRoomProvider}
				useRoom={fakeUseRoom}
				useOthers={fakeUseOthers}
			/>,
		);
		expect(capturedRoomId).toBeUndefined();
		expect(html).toContain("single player body");
		expect(html).not.toContain("Совместное редактирование");
	});
});
