import {
	RoxRoomProvider as DefaultRoomProvider,
	useOthers as defaultUseOthers,
} from "@rox/collab/client";
import { PresenceStack, type PresenceUser } from "@rox/ui/presence-stack";
import type { ComponentType, ReactNode } from "react";

/** A peer as exposed by Liveblocks `useOthers()` (the slice we consume). */
interface PresenceOther {
	connectionId: number;
	info?: { name?: string; avatarUrl?: string | null } | null;
}

type RoomProviderComponent = ComponentType<{
	roomId: string;
	authEndpoint: (roomId: string) => Promise<{ token: string }>;
	children: ReactNode;
}>;

export interface PresenceRoomProps {
	/** Org-scoped room id (`org:{orgId}:dashboard:{workspaceId}`). */
	roomId: string;
	/**
	 * Mints a scoped Liveblocks session token. In the app this wraps the cloud
	 * tRPC `collab.authRoom` mutation so the client never holds
	 * `LIVEBLOCKS_SECRET_KEY`.
	 */
	authEndpoint: (roomId: string) => Promise<{ token: string }>;
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
 * The live half of the workspace presence mount: opens the Liveblocks room and
 * feeds the other peers' presence into the shared `PresenceStack`. Mounted only
 * once the experimental gate is open (`WorkspacePresence`), so it always has a
 * valid room id and a configured Liveblocks key.
 *
 * Ported from the proven web `DashboardPresence/PresenceRoom`; the Liveblocks
 * client (`RoxRoomProvider`) is reused unchanged from `@rox/collab/client`.
 */
export function PresenceRoom({
	roomId,
	authEndpoint,
	className,
	RoomProvider = DefaultRoomProvider,
	useOthers = defaultUseOthers,
}: PresenceRoomProps) {
	return (
		<RoomProvider roomId={roomId} authEndpoint={authEndpoint}>
			<PresenceBinding className={className} useOthers={useOthers} />
		</RoomProvider>
	);
}

/** Reads Liveblocks `useOthers()` and maps it to the presentational stack. */
function PresenceBinding({
	className,
	useOthers,
}: {
	className?: string;
	useOthers: () => readonly PresenceOther[];
}) {
	const others = useOthers();
	const users: PresenceUser[] = others.map((other) => ({
		id: String(other.connectionId),
		name: other.info?.name ?? "Гость",
		avatarUrl: other.info?.avatarUrl ?? null,
	}));

	return <PresenceStack className={className} users={users} />;
}
