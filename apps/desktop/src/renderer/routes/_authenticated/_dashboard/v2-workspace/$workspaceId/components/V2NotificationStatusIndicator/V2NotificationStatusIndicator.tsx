import { StatusPulse, useShouldAnimate } from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import {
	type ActivePaneStatus,
	STATUS_CONFIG,
} from "renderer/screens/main/components/StatusIndicator/StatusIndicator";
import {
	useV2SourcesNotificationStatus,
	type V2NotificationSourceInput,
} from "renderer/stores/v2-notifications";

interface V2NotificationStatusIndicatorProps {
	sources: Iterable<V2NotificationSourceInput>;
	className?: string;
}

export function V2NotificationStatusIndicator({
	sources,
	className,
}: V2NotificationStatusIndicatorProps) {
	const { workspace } = useWorkspace();
	const status = useV2SourcesNotificationStatus(workspace.id, sources);
	const animate = useShouldAnimate("essential");

	// Track the previous status so we can replay a one-shot pulse only when a
	// fresh notification event arrives (a status transition), instead of the
	// always-on Tailwind `animate-ping`.
	const prev = useRef<ActivePaneStatus | null>(null);
	const [pulseKey, setPulseKey] = useState(0);

	useEffect(() => {
		if (!status) {
			prev.current = null;
			return;
		}
		if (status !== prev.current) {
			prev.current = status;
			setPulseKey((key) => key + 1);
		}
	}, [status]);

	if (!status) return null;

	// Reduced motion / animations off: static dot, no continuous noise.
	if (!animate) {
		return (
			<StatusIndicator status={status} pulse={false} className={className} />
		);
	}

	// One-shot pulse: remounting StatusPulse via `key={pulseKey}` replays the
	// single pulse on each fresh status transition.
	return (
		<span className={cn("relative flex size-2 shrink-0", className)}>
			<StatusPulse
				key={pulseKey}
				once
				colorClassName={STATUS_CONFIG[status].pingColor}
				className="absolute inline-flex h-full w-full opacity-75"
			/>
			<StatusIndicator status={status} pulse={false} />
		</span>
	);
}
