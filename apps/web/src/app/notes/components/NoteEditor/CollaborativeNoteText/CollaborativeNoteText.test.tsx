import { afterAll, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The collaborative note binding MUST stay single-player when the gate is
 * closed: with no active org (and/or no Liveblocks key) it renders the plain
 * controlled textarea and never mounts a Liveblocks room — so the editor has
 * ZERO behavioral regression vs. today. The auth/env/tRPC modules are
 * module-mocked only to satisfy import-time singletons; the assertion exercises
 * the gate via the (absent) active org. A collaborative render path would pull
 * in the live Liveblocks client (no server in a unit test), so the
 * gate-closed/open SELECTION is what we assert here; the actual CRDT convergence
 * is proven server-free in `@rox/collab` `yjs.test.ts`, and the gate decision in
 * `resolveNoteEditorGate.test.ts`.
 */
mock.module("@rox/auth/client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));
mock.module("@/env", () => ({
	env: { NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY: undefined, NODE_ENV: "test" },
}));
mock.module("@/trpc/client", () => ({
	trpcClient: {
		collab: { authRoom: { mutate: async () => ({ token: "t" }) } },
	},
}));

const { CollaborativeNoteText } = await import("./CollaborativeNoteText");
const { resolveNoteEditorGate } = await import(
	"../../../utils/resolveNoteEditorGate"
);

afterAll(() => {
	mock.restore();
});

const ORG = "00000000-0000-0000-0000-0000000000aa";
const NOTE = "00000000-0000-0000-0000-0000000000bb";

describe("CollaborativeNoteText gate selection", () => {
	test("renders the single-player textarea (no room) when the gate is closed", () => {
		const html = renderToStaticMarkup(
			<CollaborativeNoteText
				noteId={NOTE}
				value="single player body"
				onChange={() => {}}
			/>,
		);
		// The plain textarea is present with the current value...
		expect(html).toContain("single player body");
		expect(html).toContain("Текст заметки в формате Markdown");
		// ...and the collaborative-only affordance is absent (no room was mounted).
		expect(html).not.toContain("Совместное редактирование");
	});

	test("selects the single-player path for the closed gate, collaborative for the open one", () => {
		// OFF: no key (the component's default env) -> single-player.
		expect(
			resolveNoteEditorGate({
				publicKey: undefined,
				organizationId: ORG,
				noteId: NOTE,
			}).enabled,
		).toBe(false);

		// ON: configured key + org -> the component would mount the SAME note room
		// presence opens (proven by the shared room-id shape).
		const open = resolveNoteEditorGate({
			publicKey: "pk_test",
			organizationId: ORG,
			noteId: NOTE,
		});
		expect(open.enabled).toBe(true);
		expect(open.roomId).toBe(`org:${ORG}:note:${NOTE}`);
	});
});
