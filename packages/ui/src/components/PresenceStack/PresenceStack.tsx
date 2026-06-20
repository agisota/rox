"use client";

import { AnimatePresence, motion } from "motion/react";

import { cn } from "../../lib/utils";
import { motionSpring, staggerItem, useShouldAnimate } from "../../motion";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

/** Minimal presence shape — the app maps LiveBlocks `useOthers()` into this. */
export interface PresenceUser {
	/** Stable id (used as the React key). */
	id: string;
	/** Display name; first letter is the avatar fallback. */
	name: string;
	/** Avatar image URL, or null to show the initial fallback. */
	avatarUrl?: string | null;
}

export interface PresenceStackProps {
	/** Peers currently present. */
	users: readonly PresenceUser[];
	/** Cap the rendered avatars; the rest collapse into a "+N" chip. */
	max?: number;
	/** Hide the breathing "live" indicator. */
	hideLiveIndicator?: boolean;
	className?: string;
}

/**
 * "Who's here" avatar stack in the shared Rox motion language.
 *
 * Pure presentational — NO LiveBlocks/realtime import (keeps `@rox/ui`
 * framework-agnostic); the app feeds it `useOthers()` data. Entrance uses the
 * governor-A `staggerItem` variant + `motionSpring.soft`; the live pulse is
 * governor-A-gated (`useShouldAnimate('decorative')`) so it renders a static dot
 * when motion is off/essential — it does NOT use the governor-B `PulseDot`, so
 * it works in any app shell without `MotionFrameProvider`.
 */
export function PresenceStack({
	users,
	max = 5,
	hideLiveIndicator = false,
	className,
}: PresenceStackProps) {
	const animate = useShouldAnimate("decorative");
	const visible = users.slice(0, max);
	const overflow = users.length - visible.length;

	return (
		<div
			className={cn("flex items-center gap-2", className)}
			data-slot="presence-stack"
		>
			{!hideLiveIndicator && users.length > 0 ? (
				<LiveDot animate={animate} />
			) : null}
			<div className="flex items-center -space-x-2">
				<AnimatePresence initial={animate}>
					{visible.map((user) => (
						<motion.div
							key={user.id}
							variants={staggerItem}
							initial={animate ? "hidden" : false}
							animate="visible"
							exit={animate ? { opacity: 0, scale: 0.8 } : undefined}
							transition={motionSpring.soft}
							className="ring-background rounded-full ring-2"
							data-slot="presence-avatar"
							title={user.name}
						>
							<Avatar className="size-7">
								{user.avatarUrl ? (
									<AvatarImage src={user.avatarUrl} alt={user.name} />
								) : null}
								<AvatarFallback className="text-xs">
									{initial(user.name)}
								</AvatarFallback>
							</Avatar>
						</motion.div>
					))}
				</AnimatePresence>
				{overflow > 0 ? (
					<div
						className="ring-background bg-muted text-muted-foreground flex size-7 items-center justify-center rounded-full text-xs ring-2"
						data-slot="presence-overflow"
						title={`${overflow} more`}
					>
						+{overflow}
					</div>
				) : null}
			</div>
		</div>
	);
}

function LiveDot({ animate }: { animate: boolean }) {
	const baseStyle = {
		display: "inline-block",
		width: 8,
		height: 8,
		borderRadius: "9999px",
	} as const;

	if (!animate) {
		return (
			<span
				className="bg-emerald-500"
				style={baseStyle}
				data-slot="presence-live"
				data-live-static="true"
			/>
		);
	}

	return (
		<motion.span
			className="bg-emerald-500"
			style={baseStyle}
			data-slot="presence-live"
			animate={{ opacity: [1, 0.4, 1], scale: [1, 1.18, 1] }}
			transition={{
				duration: 1.6,
				repeat: Number.POSITIVE_INFINITY,
				ease: "easeInOut",
			}}
		/>
	);
}

function initial(name: string): string {
	return name.trim().charAt(0).toUpperCase() || "?";
}
