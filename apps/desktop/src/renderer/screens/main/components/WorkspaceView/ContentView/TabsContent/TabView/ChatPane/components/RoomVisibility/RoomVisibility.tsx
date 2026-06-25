import {
	RoxRoomProvider as DefaultRoomProvider,
	useOthers as defaultUseOthers,
} from "@rox/collab/client";
import { dashboardRoomId, deriveRoomVisibility } from "@rox/collab/types";
import type { PresenceUser } from "@rox/ui/presence-stack";
import {
	RoomVisibilityBadge,
	type RoomVisibility as RoomVisibilityLiteral,
} from "@rox/ui/room-visibility-badge";
import type { ComponentType, ReactNode } from "react";
import { useCallback } from "react";
import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

/** A peer slice as exposed by Liveblocks `useOthers()` for this surface. */
interface PresenceOther {
	connectionId: number;
	info?: { name?: string; avatarUrl?: string | null } | null;
}

type RoomProviderComponent = ComponentType<{
	roomId: string;
	authEndpoint: (roomId: string) => Promise<{ token: string }>;
	children: ReactNode;
}>;

export interface RoomVisibilityProps {
	/**
	 * The chat session/thread the presence room binds to. `null` (no session
	 * yet) keeps the surface inert.
	 */
	sessionId: string | null;
	/** Active org id (room scoping). When null the surface stays inert. */
	organizationId: string | null;
	/**
	 * Explicit room-level share flag from room metadata, when known. Forces
	 * `shared` even with no live peers. Omitted → visibility is derived purely
	 * from live membership.
	 */
	explicitlyShared?: boolean;
	className?: string;
	/**
	 * Injectable Liveblocks bindings (default to the real `@rox/collab/client`).
	 * Kept as props so tests can supply fakes WITHOUT module-mocking, which is
	 * fragile across files under `bun test`.
	 */
	RoomProvider?: RoomProviderComponent;
	useOthers?: () => readonly PresenceOther[];
}

/**
 * Private-vs-shared visibility indicator for the desktop ChatPane header
 * (issue F37). Reuses the proven desktop presence pattern (`ThreadPresence` /
 * `PresenceRoom`): `ExperimentalFeatureGate` → `@rox/collab/client` room →
 * `useOthers()`, then derives `visibility` in the shared `@rox/collab` layer
 * (`deriveRoomVisibility`) and renders the shared `@rox/ui`
 * `RoomVisibilityBadge`. INERT (renders nothing) until the presence experiment
 * is available and an org exists. Token mint is delegated to the cloud
 * `collab.authRoom` tRPC mutation so no secret reaches the client.
 */
export function RoomVisibility(props: RoomVisibilityProps) {
	return (
		<ExperimentalFeatureGate featureId="collaboration.presence" fallback={null}>
			<RoomVisibilityInner {...props} />
		</ExperimentalFeatureGate>
	);
}

function RoomVisibilityInner({
	sessionId,
	organizationId,
	explicitlyShared,
	className,
	RoomProvider = DefaultRoomProvider,
	useOthers = defaultUseOthers,
}: RoomVisibilityProps) {
	const authEndpoint = useCallback(async (roomId: string) => {
		const { token } = await apiTrpcClient.collab.authRoom.mutate({ roomId });
		return { token };
	}, []);

	// Without an active org or a session we cannot scope a room; render nothing
	// rather than open a room that can only ever fail authorization.
	if (!organizationId || !sessionId) return null;

	return (
		<RoomVisibilityRoom
			roomId={dashboardRoomId(organizationId, sessionId)}
			authEndpoint={authEndpoint}
			explicitlyShared={explicitlyShared}
			className={className}
			RoomProvider={RoomProvider}
			useOthers={useOthers}
		/>
	);
}

export interface RoomVisibilityRoomProps {
	/** Org-scoped room id (`org:{orgId}:dashboard:{sessionId}`). */
	roomId: string;
	/**
	 * Mints a scoped Liveblocks session token. In the app this wraps the cloud
	 * tRPC `collab.authRoom` mutation so the client never holds
	 * `LIVEBLOCKS_SECRET_KEY`.
	 */
	authEndpoint: (roomId: string) => Promise<{ token: string }>;
	explicitlyShared?: boolean;
	className?: string;
	/** Injectable Liveblocks bindings (default to the real client). */
	RoomProvider?: RoomProviderComponent;
	useOthers?: () => readonly PresenceOther[];
}

/**
 * The live half of the ChatPane visibility mount: opens the Liveblocks room and
 * renders the derived badge. Mounted only once the gate is open and an org
 * exists, so it always has a valid room id and a configured Liveblocks key.
 */
export function RoomVisibilityRoom({
	roomId,
	authEndpoint,
	explicitlyShared,
	className,
	RoomProvider = DefaultRoomProvider,
	useOthers = defaultUseOthers,
}: RoomVisibilityRoomProps) {
	return (
		<RoomProvider roomId={roomId} authEndpoint={authEndpoint}>
			<RoomVisibilityBinding
				explicitlyShared={explicitlyShared}
				className={className}
				useOthers={useOthers}
			/>
		</RoomProvider>
	);
}

/** Reads room membership and renders the derived visibility badge. */
function RoomVisibilityBinding({
	explicitlyShared,
	className,
	useOthers,
}: {
	explicitlyShared?: boolean;
	className?: string;
	useOthers: () => readonly PresenceOther[];
}) {
	const others = useOthers();
	const visibility: RoomVisibilityLiteral = deriveRoomVisibility({
		otherMemberCount: others.length,
		explicitlyShared,
	});
	const members: PresenceUser[] = others.map((other) => ({
		id: String(other.connectionId),
		name: other.info?.name ?? "Гость",
		avatarUrl: other.info?.avatarUrl ?? null,
	}));

	return (
		<RoomVisibilityBadge
			visibility={visibility}
			members={members}
			className={className}
			privateLabel="Приватный"
			sharedLabel="Общий"
		/>
	);
}
