import {
	RoxRoomProvider as DefaultRoomProvider,
	useMyPresence as defaultUseMyPresence,
	useOthers as defaultUseOthers,
} from "@rox/collab/client";
import { dashboardRoomId } from "@rox/collab/types";
import type { ComponentType, ReactNode } from "react";
import { useCallback } from "react";
import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";

/** A peer slice as exposed by Liveblocks `useOthers()` for this surface. */
interface PresenceOther {
	connectionId: number;
	presence?: { typing?: boolean } | null;
	info?: { name?: string } | null;
}

type RoomProviderComponent = ComponentType<{
	roomId: string;
	authEndpoint: (roomId: string) => Promise<{ token: string }>;
	children: ReactNode;
}>;

/** `[presence, updatePresence]` — the slice of `useMyPresence` we consume. */
type UseMyPresence = () => [unknown, (patch: { typing?: boolean }) => void];

export interface ThreadPresenceProps {
	/** The active thread the presence room binds to. */
	threadId: string;
	/** Test seam: active org id (defaults to the better-auth session). */
	organizationId?: string;
	/**
	 * Receives a `setTyping(boolean)` callback once the room is live, so the
	 * composer can broadcast typing presence. Called with a no-op when the
	 * presence layer is inert (gate closed / no org), so the composer never has
	 * to special-case it.
	 */
	onTypingControl?: (setTyping: (typing: boolean) => void) => void;
	/**
	 * Injectable Liveblocks bindings (default to the real `@rox/collab/client`).
	 * Kept as props so tests can supply fakes WITHOUT module-mocking, which is
	 * fragile across files under `bun test`.
	 */
	RoomProvider?: RoomProviderComponent;
	useOthers?: () => readonly PresenceOther[];
	useMyPresence?: UseMyPresence;
}

/**
 * Live presence for the active desktop inbox thread: "N онлайн" + a typing
 * indicator. Ports the shipped web `ThreadPresence` onto the proven desktop
 * Liveblocks pattern (`WorkspacePresence`/`PresenceRoom` + `@rox/collab/client`
 * + `ExperimentalFeatureGate` + `collab.authRoom`). INERT until the Liveblocks
 * provider env is configured (the `collaboration.presence` experiment resolves
 * `available`) and an active org exists — when inert it renders nothing and
 * hands the composer a no-op `setTyping`. The token mint is delegated to the
 * cloud `collab.authRoom` tRPC mutation, so no secret reaches the client.
 */
export function ThreadPresence(props: ThreadPresenceProps) {
	return (
		<ExperimentalFeatureGate
			featureId="collaboration.presence"
			fallback={<InertTypingControl onTypingControl={props.onTypingControl} />}
		>
			<ThreadPresenceInner {...props} />
		</ExperimentalFeatureGate>
	);
}

function ThreadPresenceInner({
	threadId,
	organizationId,
	onTypingControl,
	RoomProvider,
	useOthers,
	useMyPresence,
}: ThreadPresenceProps) {
	const { data: session } = authClient.useSession();
	const activeOrganizationId =
		organizationId ?? session?.session?.activeOrganizationId ?? null;

	const authEndpoint = useCallback(async (roomId: string) => {
		const { token } = await apiTrpcClient.collab.authRoom.mutate({ roomId });
		return { token };
	}, []);

	// Without an active org we cannot scope a room; render nothing rather than
	// open a room that can only ever fail authorization — but still hand the
	// composer a no-op so it never special-cases an inert presence layer.
	if (!activeOrganizationId) {
		return <InertTypingControl onTypingControl={onTypingControl} />;
	}

	return (
		<ThreadPresenceRoom
			roomId={dashboardRoomId(activeOrganizationId, threadId)}
			authEndpoint={authEndpoint}
			onTypingControl={onTypingControl}
			RoomProvider={RoomProvider}
			useOthers={useOthers}
			useMyPresence={useMyPresence}
		/>
	);
}

/**
 * Hands the composer a no-op `setTyping` for the inert (gate-closed / no-org)
 * path and renders nothing. The control is published during render (mirroring
 * the shipped web `ThreadPresence` inert branch) so it is wired even though
 * desktop component tests render statically (no effects); the consumer stores it
 * in a stable ref, so a render-time publish triggers no re-render.
 */
function InertTypingControl({
	onTypingControl,
}: {
	onTypingControl?: (setTyping: (typing: boolean) => void) => void;
}) {
	onTypingControl?.(() => {});
	return null;
}

export interface ThreadPresenceRoomProps {
	/** Org-scoped room id (`org:{orgId}:dashboard:{threadId}`). */
	roomId: string;
	/**
	 * Mints a scoped Liveblocks session token. In the app this wraps the cloud
	 * tRPC `collab.authRoom` mutation so the client never holds
	 * `LIVEBLOCKS_SECRET_KEY`.
	 */
	authEndpoint: (roomId: string) => Promise<{ token: string }>;
	onTypingControl?: (setTyping: (typing: boolean) => void) => void;
	/** Injectable Liveblocks bindings (default to the real client). */
	RoomProvider?: RoomProviderComponent;
	useOthers?: () => readonly PresenceOther[];
	useMyPresence?: UseMyPresence;
}

/**
 * The live half of the desktop inbox presence mount: opens the Liveblocks room
 * and renders the online/typing summary. Mounted only once the experimental
 * gate is open and an org exists, so it always has a valid room id and a
 * configured Liveblocks key. Ported from the proven web `ThreadPresence` +
 * desktop `PresenceRoom` injectable-bindings pattern.
 */
export function ThreadPresenceRoom({
	roomId,
	authEndpoint,
	onTypingControl,
	RoomProvider = DefaultRoomProvider,
	useOthers = defaultUseOthers,
	useMyPresence = defaultUseMyPresence as UseMyPresence,
}: ThreadPresenceRoomProps) {
	return (
		<RoomProvider roomId={roomId} authEndpoint={authEndpoint}>
			<PresenceBinding
				onTypingControl={onTypingControl}
				useOthers={useOthers}
				useMyPresence={useMyPresence}
			/>
		</RoomProvider>
	);
}

/** Reads room presence and renders the online/typing summary. */
function PresenceBinding({
	onTypingControl,
	useOthers,
	useMyPresence,
}: {
	onTypingControl?: (setTyping: (typing: boolean) => void) => void;
	useOthers: () => readonly PresenceOther[];
	useMyPresence: UseMyPresence;
}) {
	const others = useOthers();
	const [, updateMyPresence] = useMyPresence();

	// Expose a typing setter to the parent (composer). Published during render
	// (not in an effect) so it is wired under desktop's static component tests
	// too; the consumer stores it in a stable ref, so this triggers no
	// re-render.
	onTypingControl?.((typing: boolean) => updateMyPresence({ typing }));

	// Online = me + others.
	const onlineCount = others.length + 1;
	const typingNames = others
		.filter((o) => o.presence?.typing)
		.map((o) => o.info?.name ?? "Кто-то");

	return (
		<div className="flex items-center gap-2 text-muted-foreground text-xs">
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
