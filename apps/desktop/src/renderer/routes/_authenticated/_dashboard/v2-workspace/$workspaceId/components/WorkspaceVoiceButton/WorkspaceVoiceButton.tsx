import { RoxRoomAudioRenderer } from "@rox/rtc/client";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { LiveRoomActivityPanel } from "@rox/ui/live-room-activity-panel";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { toast } from "@rox/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { Activity, Loader2, Mic, MicOff, PhoneOff, Radio } from "lucide-react";
import { useCallback } from "react";
import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { authClient } from "renderer/lib/auth-client";
import { logger } from "renderer/lib/logger";
import { useWorkspaceVoiceRoom } from "./useWorkspaceVoiceRoom";

interface WorkspaceVoiceButtonProps {
	workspaceId: string;
}

/**
 * Workspace-header affordance for the LiveKit-backed voice room (`@rox/rtc`).
 *
 * Gated behind the `live.voiceRooms` experiment, which only resolves to
 * `available` when the LiveKit env (incl. `NEXT_PUBLIC_LIVEKIT_URL`) is
 * configured — so this stays hidden when voice is not set up. Behaviour comes
 * from the shared `useVoiceRoom` hook; the UI is built from `@rox/ui` + theme
 * tokens (no LiveKit prebuilt styling).
 */
export function WorkspaceVoiceButton({
	workspaceId,
}: WorkspaceVoiceButtonProps) {
	return (
		<ExperimentalFeatureGate featureId="live.voiceRooms">
			<WorkspaceVoiceButtonInner workspaceId={workspaceId} />
		</ExperimentalFeatureGate>
	);
}

function WorkspaceVoiceButtonInner({ workspaceId }: WorkspaceVoiceButtonProps) {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	// Without an active organization we cannot scope a room name; render nothing
	// rather than a button that can only ever fail.
	if (!organizationId) return null;

	return (
		<VoiceRoomControls
			organizationId={organizationId}
			workspaceId={workspaceId}
		/>
	);
}

interface VoiceRoomControlsProps {
	organizationId: string;
	workspaceId: string;
}

function VoiceRoomControls({
	organizationId,
	workspaceId,
}: VoiceRoomControlsProps) {
	const {
		room,
		state,
		isMuted,
		participantCount,
		roomActivity,
		connect,
		disconnect,
		toggleMute,
	} = useWorkspaceVoiceRoom({ organizationId, workspaceId });

	const handleConnect = useCallback(async () => {
		try {
			await connect();
		} catch (error) {
			logger.error("[WorkspaceVoiceButton] Failed to join voice room:", error);
			toast.error("Не удалось подключиться к голосовой комнате");
		}
	}, [connect]);

	const handleDisconnect = useCallback(async () => {
		try {
			await disconnect();
		} catch (error) {
			logger.error("[WorkspaceVoiceButton] Failed to leave voice room:", error);
		}
	}, [disconnect]);

	const handleToggleMute = useCallback(async () => {
		try {
			await toggleMute();
		} catch (error) {
			logger.error("[WorkspaceVoiceButton] Failed to toggle mute:", error);
		}
	}, [toggleMute]);

	const isConnecting = state === "connecting";
	const isConnected = state === "connected";

	if (!isConnected) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="xs"
						aria-label="Join voice room"
						disabled={isConnecting}
						onClick={handleConnect}
						className="border border-border/60 bg-muted/30 text-muted-foreground shadow-none hover:bg-accent/60 hover:text-foreground"
					>
						{isConnecting ? (
							<Loader2 className="size-3.5 animate-spin" />
						) : (
							<Mic className="size-3.5" />
						)}
						<span>{isConnecting ? "Подключение…" : "Голос"}</span>
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					Подключиться к голосовой комнате рабочего пространства
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<div className="flex items-center gap-1">
			<RoxRoomAudioRenderer room={room} />
			<Badge
				variant="outline"
				className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
			>
				<Radio className="size-3 animate-pulse" aria-hidden />
				<span>В голосе</span>
				<span className="tabular-nums text-muted-foreground">
					{participantCount}
				</span>
			</Badge>
			<ExperimentalFeatureGate featureId="live.transcript">
				<Popover>
					<Tooltip>
						<TooltipTrigger asChild>
							<PopoverTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label="Активность комнаты"
									className="text-muted-foreground hover:text-foreground"
								>
									<Activity className="size-3.5" />
								</Button>
							</PopoverTrigger>
						</TooltipTrigger>
						<TooltipContent side="bottom" sideOffset={4}>
							Активность комнаты
						</TooltipContent>
					</Tooltip>
					<PopoverContent
						side="bottom"
						align="end"
						sideOffset={6}
						className="w-auto"
					>
						<LiveRoomActivityPanel activity={roomActivity} />
					</PopoverContent>
				</Popover>
			</ExperimentalFeatureGate>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
						aria-pressed={isMuted}
						onClick={handleToggleMute}
						className="text-muted-foreground hover:text-foreground"
					>
						{isMuted ? (
							<MicOff className="size-3.5 text-destructive" />
						) : (
							<Mic className="size-3.5" />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					{isMuted ? "Включить микрофон" : "Выключить микрофон"}
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label="Leave voice room"
						onClick={handleDisconnect}
						className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
					>
						<PhoneOff className="size-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					Покинуть голосовую комнату
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
