import { cn } from "@rox/ui/utils";
import { motion } from "framer-motion";
import {
	LuCircleDot,
	LuCloud,
	LuCloudOff,
	LuGitMerge,
	LuGitPullRequest,
	LuMonitor,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	ease,
	motionDuration,
	StatusPulse,
	useShouldAnimate,
} from "renderer/motion";
import { STROKE_WIDTH } from "../constants";

type PRState = "open" | "merged" | "closed" | "draft";

/** Connection state surfaced by {@link WorkspaceConnectionBadge}. */
export type WorkspaceConnectionState =
	| "local"
	| "cloud"
	| "connecting"
	| "offline";

interface WorkspaceStatusBadgeProps {
	state: PRState;
	prNumber?: number;
	prUrl?: string;
	className?: string;
}

export function WorkspaceStatusBadge({
	state,
	prNumber,
	prUrl,
	className,
}: WorkspaceStatusBadgeProps) {
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const iconClass = "w-3 h-3";

	const config = {
		open: {
			icon: (
				<LuGitPullRequest
					className={cn(iconClass, "text-emerald-500")}
					strokeWidth={STROKE_WIDTH}
				/>
			),
			bgColor: "bg-emerald-500/10",
			hoverBgColor: "hover:bg-emerald-500/30",
		},
		merged: {
			icon: (
				<LuGitMerge
					className={cn(iconClass, "text-purple-500")}
					strokeWidth={STROKE_WIDTH}
				/>
			),
			bgColor: "bg-purple-500/10",
			hoverBgColor: "hover:bg-purple-500/30",
		},
		closed: {
			icon: (
				<LuCircleDot
					className={cn(iconClass, "text-destructive")}
					strokeWidth={STROKE_WIDTH}
				/>
			),
			bgColor: "bg-destructive/10",
			hoverBgColor: "hover:bg-destructive/30",
		},
		draft: {
			icon: (
				<LuGitPullRequest
					className={cn(iconClass, "text-muted-foreground")}
					strokeWidth={STROKE_WIDTH}
				/>
			),
			bgColor: "bg-muted",
			hoverBgColor: "hover:bg-muted/70",
		},
	};

	const { icon, bgColor, hoverBgColor } = config[state];

	const animate = useShouldAnimate("decorative");

	const handleClick = (e: React.MouseEvent) => {
		if (prUrl) {
			e.stopPropagation();
			openUrl.mutate(prUrl);
		}
	};

	const isClickable = !!prUrl;

	return (
		<motion.button
			layout
			type="button"
			onClick={handleClick}
			disabled={!isClickable}
			initial={animate ? { opacity: 0, x: -4 } : false}
			animate={{ opacity: 1, x: 0 }}
			exit={{ opacity: 0, x: -4 }}
			transition={{ duration: motionDuration.fast, ease: ease.standard }}
			className={cn(
				"flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] leading-none shrink-0 transition-colors",
				bgColor,
				isClickable && [hoverBgColor, "cursor-pointer"],
				!isClickable && "cursor-default",
				className,
			)}
		>
			{icon}
			{prNumber && (
				<span className="text-muted-foreground font-mono tabular-nums leading-none">
					#{prNumber}
				</span>
			)}
		</motion.button>
	);
}

interface WorkspaceConnectionBadgeProps {
	state: WorkspaceConnectionState;
	className?: string;
}

/**
 * Presentational connection-state badge for a sidebar workspace row. Fades and
 * slides on mount / state-change; while `connecting`, the dot pulses via the
 * motion foundation's {@link StatusPulse}. Reduced-motion is honored through
 * `useShouldAnimate` (enter animation short-circuits) and StatusPulse's own
 * gating, so no animation runs when the decorative tier is suppressed.
 */
export function WorkspaceConnectionBadge({
	state,
	className,
}: WorkspaceConnectionBadgeProps) {
	const animate = useShouldAnimate("decorative");
	const iconClass = "w-3 h-3";

	const config = {
		local: {
			icon: (
				<LuMonitor
					className={cn(iconClass, "text-sky-500")}
					strokeWidth={STROKE_WIDTH}
				/>
			),
			label: "local",
			color: "text-sky-500",
			bgColor: "bg-sky-500/10",
		},
		cloud: {
			icon: (
				<LuCloud
					className={cn(iconClass, "text-indigo-500")}
					strokeWidth={STROKE_WIDTH}
				/>
			),
			label: "cloud",
			color: "text-indigo-500",
			bgColor: "bg-indigo-500/10",
		},
		connecting: {
			icon: <StatusPulse className="text-amber-500" />,
			label: "connecting",
			color: "text-amber-500",
			bgColor: "bg-amber-500/10",
		},
		offline: {
			icon: (
				<LuCloudOff
					className={cn(iconClass, "text-muted-foreground")}
					strokeWidth={STROKE_WIDTH}
				/>
			),
			label: "offline",
			color: "text-muted-foreground",
			bgColor: "bg-muted",
		},
	} satisfies Record<
		WorkspaceConnectionState,
		{ icon: React.ReactNode; label: string; color: string; bgColor: string }
	>;

	const { icon, label, color, bgColor } = config[state];

	return (
		<motion.span
			layout
			initial={animate ? { opacity: 0, x: -4 } : false}
			animate={{ opacity: 1, x: 0 }}
			exit={{ opacity: 0, x: -4 }}
			transition={{ duration: motionDuration.fast, ease: ease.standard }}
			className={cn(
				"flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] leading-none shrink-0",
				bgColor,
				color,
				className,
			)}
		>
			{icon}
			<span className="font-medium leading-none">{label}</span>
		</motion.span>
	);
}
