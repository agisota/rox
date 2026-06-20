"use client";

import { authClient } from "@rox/auth/client";
import { RoxRoomProvider, useOthers } from "@rox/collab/client";
import { useCallback, useMemo } from "react";

import { env } from "@/env";
import { trpcClient } from "@/trpc/client";
import { resolveNotePresenceGate } from "../../../utils/resolveNotePresenceGate";

/** A peer slice as exposed by LiveBlocks `useOthers()` for this surface. */
interface PresenceOther {
	connectionId: number;
	info?: { name?: string } | null;
}

export interface NotePresenceProps {
	/** The active note the editor room binds to. */
	noteId: string;
	/** Test seam: active org id (defaults to the better-auth session). */
	organizationId?: string;
	/** Test seam: LiveBlocks public key (defaults to the validated web env). */
	publicKey?: string;
}

/**
 * Live collaboration boundary for the markdown editor. Reuses `@rox/collab`
 * (LiveBlocks) + the existing `collaboration.presence` experimental gate — it is
 * INERT until the LiveBlocks public key is configured and an org/note scope
 * exists, so the editor stays single-player by default. The token mint is
 * delegated to the `collab.authRoom` tRPC mutation, so no secret reaches the
 * client. The room id is `org:{orgId}:note:{noteId}`, authorized by the existing
 * id-derived ACL with no new flag and no schema change.
 */
export function NotePresence({
	noteId,
	organizationId,
	publicKey,
}: NotePresenceProps) {
	const session = authClient.useSession();
	const activeOrganizationId =
		organizationId ?? session.data?.session?.activeOrganizationId ?? undefined;
	const liveblocksPublicKey =
		publicKey ?? env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY;

	const gate = useMemo(
		() =>
			resolveNotePresenceGate({
				publicKey: liveblocksPublicKey,
				organizationId: activeOrganizationId,
				noteId,
			}),
		[liveblocksPublicKey, activeOrganizationId, noteId],
	);

	const authEndpoint = useCallback(async (roomId: string) => {
		const { token } = await trpcClient.collab.authRoom.mutate({ roomId });
		return { token };
	}, []);

	if (!gate.enabled || !gate.roomId) {
		return null;
	}

	return (
		<RoxRoomProvider roomId={gate.roomId} authEndpoint={authEndpoint}>
			<PresenceBinding />
		</RoxRoomProvider>
	);
}

/** Reads room presence and renders the "N редактируют" summary. */
function PresenceBinding() {
	const others = useOthers() as unknown as readonly PresenceOther[];
	const onlineCount = others.length + 1;

	return (
		<span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
			<span className="size-1.5 rounded-full bg-emerald-500" />
			{onlineCount} редактируют
		</span>
	);
}
