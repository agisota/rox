import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useClaudeSession } from "@/hooks/useClaudeSession";
import { useTerminalStatus } from "@/hooks/useTerminalStatus";
import { SurfaceStatusBadge } from "../SurfaceStatusBadge";

interface WorkspaceRowSurfaceProps {
	/** The v2 workspace whose live Claude + terminal status to show. */
	workspaceId: string;
}

/**
 * Compact live Claude-session + terminal status for a single workspace row
 * (FN-016/FN-087). Reads the org collections, so it only mounts inside the
 * access-gated workspace detail screen (FN-086). Each badge maps the shared
 * surface status to a labelled, optionally-pulsing indicator.
 */
export function WorkspaceRowSurface({ workspaceId }: WorkspaceRowSurfaceProps) {
	const claude = useClaudeSession(workspaceId);
	const terminal = useTerminalStatus(workspaceId);

	return (
		<View className="mt-1 flex-row items-center gap-2">
			<View className="flex-row items-center gap-1.5">
				<Text className="text-xs text-muted-foreground">Claude</Text>
				<SurfaceStatusBadge status={claude.status} />
			</View>
			<View className="flex-row items-center gap-1.5">
				<Text className="text-xs text-muted-foreground">Terminal</Text>
				<SurfaceStatusBadge status={terminal.status} />
			</View>
		</View>
	);
}
