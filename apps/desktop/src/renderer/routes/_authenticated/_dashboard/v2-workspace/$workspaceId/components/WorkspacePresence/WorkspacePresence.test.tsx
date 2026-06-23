import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type {
	ExperimentalFeatureId,
	ExperimentalFeatureState,
} from "@rox/shared/experimental-features";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The desktop workspace presence mount is GATED on the `collaboration.presence`
 * experiment. This suite proves the two contractual halves of the slice:
 *
 *   1. enabled + available (Liveblocks provider configured) + an active org
 *      → the live presence surface mounts and renders peer avatars, and
 *   2. NOT available (e.g. provider env absent → `needs_configuration`) OR no
 *      active org → the surface degrades to nothing (no provider, no network,
 *      no broken UI).
 *
 * We drive the gate by mocking `useExperimentalFeature` (its data source) and
 * inject fake Liveblocks bindings via `@rox/collab/client` so the assertion
 * exercises OUR wiring, never the real Liveblocks cloud. The auth + cloud-tRPC
 * singletons are mocked only to satisfy import-time resolution. Mocks are
 * restored after the suite so sibling desktop suites are unaffected.
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
		useSession: () => ({
			data: { session: { activeOrganizationId } },
		}),
	},
}));

mock.module("renderer/lib/api-trpc-client", () => ({
	apiTrpcClient: {
		collab: { authRoom: { mutate: async () => ({ token: "t" }) } },
	},
}));

// Fake Liveblocks bindings so the real provider/cloud never runs under the
// static render; capture the room id and emit two peers so we can assert the
// avatars surface when the gate is open.
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
	useOthers: () => [
		{ connectionId: 1, info: { name: "Ada", avatarUrl: null } },
		{ connectionId: 2, info: { name: "Linus", avatarUrl: null } },
	],
}));

const { WorkspacePresence } = await import("./WorkspacePresence");

afterAll(() => {
	mock.restore();
});

beforeEach(() => {
	featureState = makeState("available", true);
	activeOrganizationId = "org_1";
	capturedRoomId = undefined;
});

describe("WorkspacePresence (gate)", () => {
	test("renders live presence avatars when enabled, available, and org-scoped", () => {
		const html = renderToStaticMarkup(<WorkspacePresence workspaceId="ws_1" />);

		// the gate opened: the room boundary received our org-scoped id
		expect(capturedRoomId).toBe("org:org_1:dashboard:ws_1");
		// and the peers surfaced as avatars
		const avatarCount = html.split('data-slot="presence-avatar"').length - 1;
		expect(avatarCount).toBe(2);
		expect(html).toContain("Ada");
	});

	test("degrades to nothing when the provider is not configured (needs_configuration)", () => {
		// LIVEBLOCKS_* env absent → the main-process resolver reports
		// `needs_configuration`; the gate must hide the surface entirely.
		featureState = makeState("needs_configuration", true);

		const html = renderToStaticMarkup(<WorkspacePresence workspaceId="ws_1" />);

		expect(html).toBe("");
		// no provider was mounted → no room was opened (no network)
		expect(capturedRoomId).toBeUndefined();
	});

	test("degrades to nothing when the experiment is disabled via override", () => {
		featureState = makeState("available", false);

		const html = renderToStaticMarkup(<WorkspacePresence workspaceId="ws_1" />);

		expect(html).toBe("");
		expect(capturedRoomId).toBeUndefined();
	});

	test("renders nothing when there is no active organization to scope the room", () => {
		activeOrganizationId = null;

		const html = renderToStaticMarkup(<WorkspacePresence workspaceId="ws_1" />);

		expect(html).toBe("");
		expect(capturedRoomId).toBeUndefined();
	});
});
