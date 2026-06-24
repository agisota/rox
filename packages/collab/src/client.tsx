"use client";

import {
	LiveblocksProvider,
	RoomProvider,
	useMyPresence as useMyPresenceRaw,
	useOthers as useOthersRaw,
	useRoom as useRoomRaw,
	useStorage as useStorageRaw,
} from "@liveblocks/react";
import type { ReactNode } from "react";

import type { RoxPresence } from "./types";

/**
 * The default ephemeral presence a peer starts with when joining a room.
 * Cursor off-board, nothing selected.
 */
const DEFAULT_PRESENCE: RoxPresence = {
	cursor: null,
	selectedEntryId: null,
};

export interface RoxRoomProviderProps {
	/**
	 * Org/project-scoped room id. Build it with `dashboardRoomId(orgId, dashId)`
	 * from `@rox/collab/types` so the server can authorize from the id alone.
	 */
	roomId: string;
	/**
	 * Endpoint that mints a scoped LiveBlocks session token. In the app this is
	 * the tRPC `collab.authRoom` mutation wrapped as a fetch-shaped callback so
	 * the client never sees `LIVEBLOCKS_SECRET_KEY`. LiveBlocks calls it with the
	 * room id and expects `{ token }`.
	 */
	authEndpoint: (roomId: string) => Promise<{ token: string }>;
	/** Initial presence override (defaults to an empty cursor/selection). */
	initialPresence?: RoxPresence;
	children: ReactNode;
}

/**
 * App-agnostic LiveBlocks room boundary. Wraps `LiveblocksProvider`
 * (auth via the injected mint endpoint) and `RoomProvider` (the scoped room),
 * so any app can drop a collaborative surface in without re-wiring auth.
 *
 * The token mint is delegated entirely to `authEndpoint` — this component holds
 * no secrets and is safe in any client bundle.
 */
export function RoxRoomProvider({
	roomId,
	authEndpoint,
	initialPresence = DEFAULT_PRESENCE,
	children,
}: RoxRoomProviderProps) {
	return (
		<LiveblocksProvider
			authEndpoint={async (room) => {
				// LiveBlocks may omit the room for some flows; fall back to ours.
				const { token } = await authEndpoint(room ?? roomId);
				return { token };
			}}
		>
			<RoomProvider id={roomId} initialPresence={initialPresence}>
				{children}
			</RoomProvider>
		</LiveblocksProvider>
	);
}

/** Typed re-export: the other peers currently in the room. */
export const useOthers = useOthersRaw;
/** Typed re-export: `[presence, updatePresence]` for the current connection. */
export const useMyPresence = useMyPresenceRaw;
/** Typed re-export: a slice of the room's ephemeral CRDT storage. */
export const useStorage = useStorageRaw;
/**
 * Typed re-export: the live `Room` handle for the surrounding `RoomProvider`.
 * The collaborative editor binds a `LiveblocksYjsProvider` to this room so a
 * shared `Y.Doc` rides the SAME room presence already opened.
 */
export const useRoom = useRoomRaw;
