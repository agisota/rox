"use client";

import { Button } from "@rox/ui/button";
import {
	type LiveRoomActivity,
	LiveRoomActivityPanel,
} from "@rox/ui/live-room-activity-panel";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { toast } from "@rox/ui/sonner";
import { Activity, Phone } from "lucide-react";
import { useState } from "react";

import { env } from "@/env";
import { trpcClient } from "@/trpc/client";
import { resolveLiveRoomActivityGate } from "./resolveLiveRoomActivityGate";

/**
 * Web has no live LiveKit room yet (media-join is a later wave), so the activity
 * panel renders from an empty model — it surfaces readiness, not live data.
 */
const EMPTY_WEB_ACTIVITY: LiveRoomActivity = {
	roster: [],
	speaking: [],
	log: [],
};

export interface CallButtonProps {
	/** Active organization id (the voice room is org-scoped). */
	organizationId: string | undefined;
	/** Thread id → maps 1:1 to a voice channel id. */
	threadId: string;
}

/**
 * Optional, gated call-button STUB. A thread maps to a LiveKit voice room
 * (`org:{orgId}:voice:{threadId}`, the `@rox/rtc` convention). Mints a scoped
 * `roomJoin` token via the `rtc.token` tRPC mutation — the client never sees the
 * LiveKit secret. P1 verifies the token mint; full media join lands later, so
 * the button surfaces readiness rather than opening a call UI.
 *
 * Fully inert unless `NEXT_PUBLIC_LIVEKIT_URL` is configured and an org is
 * active — matching the experimental-features posture of the presence layer.
 */
export function CallButton({ organizationId, threadId }: CallButtonProps) {
	const [pending, setPending] = useState(false);

	const livekitConfigured = Boolean(env.NEXT_PUBLIC_LIVEKIT_URL);
	if (!livekitConfigured || !organizationId) return null;

	// The activity panel reuses the same room-name convention the call button
	// mints a token for; it stays inert until `live.transcript` is ready.
	const activityGate = resolveLiveRoomActivityGate({
		livekitUrl: env.NEXT_PUBLIC_LIVEKIT_URL,
		organizationId,
		threadId,
	});

	const handleCall = async () => {
		setPending(true);
		try {
			const roomName = `org:${organizationId}:voice:${threadId}`;
			const { token } = await trpcClient.rtc.token.mutate({ roomName });
			if (!token) throw new Error("Empty token");
			// Token minted: the room is reachable. Media UI is a later wave.
			toast.success("Звонок готов к подключению");
		} catch (error) {
			console.error("[CallButton] failed to mint voice token", error);
			toast.error("Не удалось начать звонок");
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="flex items-center gap-1">
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-7"
				aria-label="Позвонить в этот тред"
				disabled={pending}
				onClick={() => {
					void handleCall();
				}}
			>
				<Phone className="size-4" />
			</Button>
			{activityGate.enabled && (
				<Popover>
					<PopoverTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-7"
							aria-label="Активность комнаты"
						>
							<Activity className="size-4" />
						</Button>
					</PopoverTrigger>
					<PopoverContent
						side="bottom"
						align="end"
						sideOffset={6}
						className="w-auto"
					>
						<LiveRoomActivityPanel
							activity={EMPTY_WEB_ACTIVITY}
							emptyHint="Голосовой звонок в вебе ещё не запущен"
						/>
					</PopoverContent>
				</Popover>
			)}
		</div>
	);
}
