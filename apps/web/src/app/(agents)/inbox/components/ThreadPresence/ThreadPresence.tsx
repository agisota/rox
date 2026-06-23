"use client";

import { authClient } from "@rox/auth/client";
import { RoxRoomProvider, useMyPresence, useOthers } from "@rox/collab/client";
import { useCallback, useEffect, useMemo } from "react";

import { env } from "@/env";
import { trpcClient } from "@/trpc/client";
import { CallButton } from "./CallButton";
import { resolveThreadPresenceGate } from "./resolveThreadPresenceGate";

/** A peer slice as exposed by LiveBlocks `useOthers()` for this surface. */
interface PresenceOther {
	connectionId: number;
	presence?: { typing?: boolean } | null;
	info?: { name?: string } | null;
}

export interface ThreadPresenceProps {
	/** The active thread the presence room binds to. */
	threadId: string;
	/** Test seam: active org id (defaults to the better-auth session). */
	organizationId?: string;
	/** Test seam: LiveBlocks public key (defaults to the validated web env). */
	publicKey?: string;
	/**
	 * Receives a `setTyping(boolean)` callback once the room is live, so the
	 * composer can broadcast typing presence. Called with a no-op when the
	 * presence layer is inert (no keys / gate closed), so the composer never has
	 * to special-case it.
	 */
	onTypingControl?: (setTyping: (typing: boolean) => void) => void;
}

/**
 * Live presence for the active thread: "N online" + a typing indicator, plus the
 * optional call button. Reuses `@rox/collab` (LiveBlocks) and the existing
 * `collaboration.presence` experimental gate — INERT until the LiveBlocks public
 * key is configured and an org/thread scope exists. The token mint is delegated
 * to the `collab.authRoom` tRPC mutation, so no secret reaches the client.
 */
export function ThreadPresence({
	threadId,
	organizationId,
	publicKey,
	onTypingControl,
}: ThreadPresenceProps) {
	const session = authClient.useSession();
	const activeOrganizationId =
		organizationId ?? session.data?.session?.activeOrganizationId ?? undefined;
	const liveblocksPublicKey =
		publicKey ?? env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY;

	const gate = useMemo(
		() =>
			resolveThreadPresenceGate({
				publicKey: liveblocksPublicKey,
				organizationId: activeOrganizationId,
				threadId,
			}),
		[liveblocksPublicKey, activeOrganizationId, threadId],
	);

	const authEndpoint = useCallback(async (roomId: string) => {
		const { token } = await trpcClient.collab.authRoom.mutate({ roomId });
		return { token };
	}, []);

	if (!gate.enabled || !gate.roomId) {
		// Inert: still surface the (separately gated) call button so a thread is
		// callable even when presence is off.
		onTypingControl?.(() => {});
		return (
			<div className="flex items-center gap-1">
				<CallButton organizationId={activeOrganizationId} threadId={threadId} />
			</div>
		);
	}

	return (
		<RoxRoomProvider roomId={gate.roomId} authEndpoint={authEndpoint}>
			<PresenceBinding onTypingControl={onTypingControl} />
			<CallButton organizationId={activeOrganizationId} threadId={threadId} />
		</RoxRoomProvider>
	);
}

/** Reads room presence and renders the online/typing summary. */
function PresenceBinding({
	onTypingControl,
}: {
	onTypingControl?: (setTyping: (typing: boolean) => void) => void;
}) {
	const others = useOthers() as unknown as readonly PresenceOther[];
	const [, updateMyPresence] = useMyPresence();

	// Expose a typing setter to the parent (composer) once mounted.
	useEffect(() => {
		onTypingControl?.((typing: boolean) => updateMyPresence({ typing }));
	}, [onTypingControl, updateMyPresence]);

	// Online = me + others.
	const onlineCount = others.length + 1;
	const typingNames = others
		.filter((o) => o.presence?.typing)
		.map((o) => o.info?.name ?? "Кто-то");

	return (
		<div className="flex items-center gap-2 text-xs text-muted-foreground">
			<span className="inline-flex items-center gap-1">
				<span className="size-1.5 rounded-full bg-emerald-500" />
				{onlineCount} онлайн
			</span>
			{typingNames.length > 0 && (
				<span className="italic">
					{typingNames.length === 1
						? `${typingNames[0]} печатает…`
						: "несколько человек печатают…"}
				</span>
			)}
		</div>
	);
}
