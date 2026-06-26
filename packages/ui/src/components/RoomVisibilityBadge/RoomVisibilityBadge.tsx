"use client";

import { Lock } from "lucide-react";

import { cn } from "../../lib/utils";
import {
	PresenceStack,
	type PresenceUser,
} from "../PresenceStack/PresenceStack";

/**
 * Room visibility, mirrored from `@rox/collab`'s `RoomVisibility` so `@rox/ui`
 * stays framework-agnostic (no realtime import). The app derives it with
 * `deriveRoomVisibility()` and passes the literal in.
 */
export type RoomVisibility = "private" | "shared";

export interface RoomVisibilityBadgeProps {
	/** `private` → lock glyph; `shared` → participants indicator + avatar stack. */
	visibility: RoomVisibility;
	/**
	 * Member peers to show on a `shared` room (reuses `PresenceStack`). Ignored
	 * for `private`. When empty on a `shared` room (e.g. invited-but-offline),
	 * only the "Shared" participants indicator renders.
	 */
	members?: readonly PresenceUser[];
	/** Cap avatars before collapsing into a "+N" chip (forwarded to the stack). */
	maxAvatars?: number;
	/** Accessible label for the private lock glyph. */
	privateLabel?: string;
	/** Accessible label for the shared indicator. */
	sharedLabel?: string;
	className?: string;
}

/**
 * Visual private-vs-shared indicator for a collaboration room (issue F37).
 *
 * Pure presentational — NO Liveblocks/realtime import, keeping `@rox/ui`
 * cross-platform. `private` renders a lock glyph; `shared` renders a
 * participants indicator and reuses the shared `PresenceStack` for the member
 * avatar stack. The room's `visibility` is derived in the shared `@rox/collab`
 * layer (`deriveRoomVisibility`) so web/desktop/mobile feed the same literal.
 */
export function RoomVisibilityBadge({
	visibility,
	members = [],
	maxAvatars = 5,
	privateLabel = "Private",
	sharedLabel = "Shared",
	className,
}: RoomVisibilityBadgeProps) {
	if (visibility === "private") {
		return (
			<output
				className={cn(
					"text-muted-foreground inline-flex items-center gap-1 text-xs",
					className,
				)}
				data-slot="room-visibility-badge"
				data-visibility="private"
				aria-label={privateLabel}
				title={privateLabel}
			>
				<Lock className="size-3" aria-hidden="true" data-slot="lock-glyph" />
				<span>{privateLabel}</span>
			</output>
		);
	}

	return (
		<output
			className={cn(
				"text-muted-foreground inline-flex items-center gap-2 text-xs",
				className,
			)}
			data-slot="room-visibility-badge"
			data-visibility="shared"
			aria-label={sharedLabel}
		>
			<span
				className="inline-flex items-center gap-1"
				data-slot="shared-indicator"
				title={sharedLabel}
			>
				<span>{sharedLabel}</span>
			</span>
			{members.length > 0 ? (
				<PresenceStack users={members} max={maxAvatars} hideLiveIndicator />
			) : null}
		</output>
	);
}
