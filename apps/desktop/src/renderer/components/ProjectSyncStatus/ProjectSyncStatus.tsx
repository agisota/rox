import { Badge } from "@rox/ui/badge";
import { cn } from "@rox/ui/utils";
import { CloudOff, Loader2, RefreshCw } from "lucide-react";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { type EntitySyncState, resolveSyncStatus } from "./syncStatus";

interface ProjectSyncStatusProps {
	/** The entity's local-first sync state (from the host `project`/`workspace` row). */
	syncState: EntitySyncState;
	className?: string;
}

/**
 * Small per-project / per-workspace local-first sync indicator (#537).
 *
 * Reads the entity's `syncState` and the live online signal, then renders a
 * non-blocking badge so the user can SEE that an offline-created thing is safe
 * and catching up — never wondering if it was lost (the app's prior
 * data-loss-on-quit bug made this trust visible-or-bust). Renders nothing once
 * `synced`, so a steady-state list stays quiet.
 *
 * The state math lives in the pure {@link resolveSyncStatus}; this component is
 * just the host-bound shell (online signal + icon/variant), keeping the decision
 * logic unit-tested and the visual layer thin.
 */
export function ProjectSyncStatus({
	syncState,
	className,
}: ProjectSyncStatusProps) {
	const online = useOnlineStatus();
	const view = resolveSyncStatus({ syncState, online });

	if (!view.visible) return null;

	const Icon =
		view.kind === "offline"
			? CloudOff
			: view.kind === "retrying"
				? RefreshCw
				: Loader2;

	return (
		<Badge
			variant="outline"
			role="status"
			aria-live="polite"
			data-sync-kind={view.kind}
			className={cn(
				"h-5 gap-1 rounded-md px-1.5 font-normal",
				view.tone === "muted" && "text-muted-foreground",
				view.tone === "warning" &&
					"border-amber-500/40 text-amber-600 dark:text-amber-400",
				className,
			)}
		>
			<Icon
				className={cn("size-3", view.kind === "syncing" && "animate-spin")}
				aria-hidden="true"
			/>
			{view.label}
		</Badge>
	);
}
