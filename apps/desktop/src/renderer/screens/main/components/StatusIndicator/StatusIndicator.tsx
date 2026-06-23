import { CompletionBurst } from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import { useEffect, useRef, useState } from "react";
import type { ActivePaneStatus } from "shared/tabs-types";

// Re-export for consumers
export type { ActivePaneStatus } from "shared/tabs-types";

/** Lookup object for status indicator styling - avoids if/else chains */
export const STATUS_CONFIG = {
	permission: {
		pingColor: "bg-red-400",
		dotColor: "bg-red-500",
		pulse: true,
		tooltip: "Требуется ввод",
	},
	working: {
		pingColor: "bg-amber-400",
		dotColor: "bg-amber-500",
		pulse: true,
		tooltip: "Агент работает",
	},
	review: {
		pingColor: "",
		dotColor: "bg-green-500",
		pulse: false,
		tooltip: "Готово к ревью",
	},
} as const satisfies Record<
	ActivePaneStatus,
	{ pingColor: string; dotColor: string; pulse: boolean; tooltip: string }
>;

interface StatusIndicatorProps {
	status: ActivePaneStatus;
	className?: string;
	/**
	 * When `false`, suppress the continuous Tailwind `animate-ping` overlay so a
	 * caller can drive a one-shot pulse instead. Defaults to `true` for
	 * backward compatibility with existing consumers.
	 */
	pulse?: boolean;
}

/**
 * Visual indicator for pane/workspace status.
 * - Red pulsing: needs user input (permission)
 * - Amber pulsing: agent working
 * - Green static: ready for review
 */
export function StatusIndicator({
	status,
	className,
	pulse = true,
}: StatusIndicatorProps) {
	const config = STATUS_CONFIG[status];
	const prevStatusRef = useRef<ActivePaneStatus | null>(null);
	const [isBursting, setIsBursting] = useState(false);

	useEffect(() => {
		if (prevStatusRef.current !== "review" && status === "review") {
			setIsBursting(true);
		}
		prevStatusRef.current = status;
	}, [status]);

	const handleBurstComplete = () => {
		setIsBursting(false);
	};

	return (
		<span className={cn("relative flex size-2 shrink-0", className)}>
			{config.pulse && pulse && (
				<span
					className={cn(
						"absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
						config.pingColor,
					)}
				/>
			)}
			{isBursting && status === "review" ? (
				<span className="absolute inset-0 flex items-center justify-center">
					<CompletionBurst size={8} onAnimationComplete={handleBurstComplete} />
				</span>
			) : (
				<span
					className={cn(
						"relative inline-flex size-2 rounded-full",
						config.dotColor,
					)}
				/>
			)}
		</span>
	);
}

/** Get tooltip text for a status - for consumers that wrap with Tooltip */
export function getStatusTooltip(status: ActivePaneStatus): string {
	return STATUS_CONFIG[status].tooltip;
}
