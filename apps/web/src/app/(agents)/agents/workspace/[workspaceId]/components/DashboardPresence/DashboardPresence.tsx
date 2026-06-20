"use client";

import { authClient } from "@rox/auth/client";
import { useCallback, useMemo } from "react";

import { env } from "@/env";
import { trpcClient } from "@/trpc/client";
import { PresenceRoom } from "./PresenceRoom";
import { resolvePresenceGate } from "./resolvePresenceGate";

export interface DashboardPresenceProps {
	/** Dashboard/workspace id the presence room is scoped to. */
	dashboardId: string;
	className?: string;
	/**
	 * Test seam: the active organization id. Defaults to the better-auth session's
	 * active org. Injected only in tests to avoid mocking the auth singleton.
	 */
	organizationId?: string;
	/**
	 * Test seam: the LiveBlocks public key. Defaults to the validated web env.
	 * Injected only in tests to avoid mocking the env singleton.
	 */
	publicKey?: string;
}

/**
 * WS-L T10 — mounts live LiveBlocks presence ("who's here") on the web dashboard
 * surface. It is INERT by default: it renders nothing until the existing
 * `collaboration.presence` experimental feature is available AND the LiveBlocks
 * public key is configured (`NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`). No new flag is
 * introduced — the gate reuses the existing experimental-features registry + env
 * keys (per D3). The durable board (WS-J) stays the source of truth; this is the
 * ephemeral presence layer on top of it.
 *
 * The token mint is delegated to the `collab.authRoom` tRPC mutation, so the
 * client never holds `LIVEBLOCKS_SECRET_KEY`.
 */
export function DashboardPresence({
	dashboardId,
	className,
	organizationId,
	publicKey,
}: DashboardPresenceProps) {
	const session = authClient.useSession();
	const activeOrganizationId =
		organizationId ?? session.data?.session?.activeOrganizationId ?? undefined;
	const liveblocksPublicKey =
		publicKey ?? env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY;

	const gate = useMemo(
		() =>
			resolvePresenceGate({
				publicKey: liveblocksPublicKey,
				organizationId: activeOrganizationId,
				dashboardId,
			}),
		[liveblocksPublicKey, activeOrganizationId, dashboardId],
	);

	const authEndpoint = useCallback(async (roomId: string) => {
		const { token } = await trpcClient.collab.authRoom.mutate({ roomId });
		return { token };
	}, []);

	if (!gate.enabled || !gate.roomId) {
		// Fully inert: no provider, no network, no DOM — safe to render anywhere
		// until keys are set and the surface is ready.
		return null;
	}

	return (
		<PresenceRoom
			authEndpoint={authEndpoint}
			className={className}
			roomId={gate.roomId}
		/>
	);
}
