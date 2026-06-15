import type { PreinstallStatusEntry } from "@rox/host-service/settings";
import { Badge } from "@rox/ui/badge";
import { cn } from "@rox/ui/utils";
import { Workflow } from "lucide-react";
import { getOmpOdwHarnessState } from "renderer/hooks/useAgentPreinstallStatus";

interface AgentHarnessStatusBadgeProps {
	entry: PreinstallStatusEntry | null | undefined;
	className?: string;
}

const LABEL_BY_STATE = {
	unavailable: "ODW unavailable",
	off: "ODW off",
	installing: "ODW installing",
	ready: "OMP + ODW",
	failed: "ODW failed",
} as const;

export function AgentHarnessStatusBadge({
	entry,
	className,
}: AgentHarnessStatusBadgeProps) {
	const state = getOmpOdwHarnessState(entry);
	const variant = state === "ready" ? "secondary" : "outline";

	return (
		<Badge
			variant={variant}
			className={cn(
				"h-6 gap-1.5 rounded-md px-2 font-normal",
				state === "failed" && "border-destructive/40 text-destructive",
				state === "installing" && "text-muted-foreground",
				className,
			)}
		>
			<Workflow className="size-3" aria-hidden="true" />
			{LABEL_BY_STATE[state]}
		</Badge>
	);
}
