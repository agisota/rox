import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type {
	ExperimentalFeatureId,
	ExperimentalFeatureState,
} from "@rox/shared/experimental-features";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The desktop inbox presence mount is GATED on the `collaboration.presence`
 * experiment (same gate as `WorkspacePresence`). This suite proves the inert
 * contract the composer relies on:
 *
 *   • gate closed (provider env absent → `needs_configuration`, or disabled, or
 *     no active org) → `ThreadPresence` renders nothing AND still hands the
 *     composer a NO-OP `setTyping`, so the composer never has to special-case an
 *     inert presence layer, and
 *   • gate open + an active org → the live room mounts (scoped room id) and the
 *     online summary surfaces.
 *
 * We drive the gate by mocking its data source (`useExperimentalFeature`) and
 * the app-internal auth/cloud-tRPC singletons (NOT shared barrels), and inject
 * fake Liveblocks bindings via `@rox/collab/client`, so the assertion exercises
 * OUR wiring, never the real Liveblocks cloud. Mocks are restored after the
 * suite so sibling desktop suites are unaffected.
 */

let featureState: ExperimentalFeatureState = makeState("available", true);
let activeOrganizationId: string | null = "org_1";
let capturedRoomId: string | undefined;

function makeState(
	availability: ExperimentalFeatureState["availability"],
	enabled: boolean,
): ExperimentalFeatureState {
	return {
		id: "collaboration.presence" as ExperimentalFeatureId,
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

mock.module("@rox/collab/client", () => ({
	RoxRoomProvider: ({
		roomId,
		children,
	}: {
		roomId: string;
		authEndpoint: (roomId: string) => Promise<{ token: string }>;
		children: ReactNode;
	}) => {
		capturedRoomId = roomId;
		return <div data-room-id={roomId}>{children}</div>;
	},
	useOthers: () => [{ connectionId: 1, info: { name: "Ada" } }],
	useMyPresence: () => [{}, () => {}],
}));

const { ThreadPresence } = await import("./ThreadPresence");

afterAll(() => {
	mock.restore();
});

beforeEach(() => {
	featureState = makeState("available", true);
	activeOrganizationId = "org_1";
	capturedRoomId = undefined;
});

describe("ThreadPresence (gate)", () => {
	test("mounts the live room and surfaces the online count when open + org-scoped", () => {
		const html = renderToStaticMarkup(<ThreadPresence threadId="thread_1" />);
		expect(capturedRoomId).toBe("org:org_1:dashboard:thread_1");
		expect(html).toContain("2 онлайн"); // me + Ada
	});

	test("renders nothing and hands a no-op setTyping when the provider is not configured", () => {
		featureState = makeState("needs_configuration", true);
		let typingControl: ((typing: boolean) => void) | null = null;

		const html = renderToStaticMarkup(
			<ThreadPresence
				threadId="thread_1"
				onTypingControl={(setTyping) => {
					typingControl = setTyping;
				}}
			/>,
		);

		expect(html).toBe("");
		expect(capturedRoomId).toBeUndefined();
		// The composer must still receive a callable no-op.
		expect(typingControl).not.toBeNull();
		expect(() =>
			(typingControl as unknown as (t: boolean) => void)(true),
		).not.toThrow();
	});

	test("renders nothing and hands a no-op setTyping when disabled via override", () => {
		featureState = makeState("available", false);
		let typingControl: ((typing: boolean) => void) | null = null;

		const html = renderToStaticMarkup(
			<ThreadPresence
				threadId="thread_1"
				onTypingControl={(setTyping) => {
					typingControl = setTyping;
				}}
			/>,
		);

		expect(html).toBe("");
		expect(typingControl).not.toBeNull();
	});

	test("renders nothing when there is no active organization to scope the room", () => {
		activeOrganizationId = null;
		let typingControl: ((typing: boolean) => void) | null = null;

		const html = renderToStaticMarkup(
			<ThreadPresence
				threadId="thread_1"
				onTypingControl={(setTyping) => {
					typingControl = setTyping;
				}}
			/>,
		);

		expect(html).toBe("");
		expect(capturedRoomId).toBeUndefined();
		expect(typingControl).not.toBeNull();
	});
});
