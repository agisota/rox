import { Button } from "@rox/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { Bell, ExternalLink, MessageSquare, Workflow, Zap } from "lucide-react";
import type { ComponentType } from "react";
import type { InboxItem, SystemAction } from "../types";
import { formatRelativeTime } from "../utils/inboxTime";
import { openSystemSource } from "../utils/openSystemSource";

export interface SystemEventCardProps {
	item: InboxItem;
}

/** Primary-action presentation (icon + label) for each system-action kind. */
const ACTION_VISUAL: Record<
	SystemAction["kind"],
	{ label: string; Icon: ComponentType<{ className?: string }> }
> = {
	"open-pr": { label: "Открыть PR в браузере", Icon: ExternalLink },
	"open-workspace": { label: "Перейти в Workspace", Icon: Workflow },
	"open-automation": { label: "Открыть Automation", Icon: Zap },
	"reply-agent": { label: "Ответить агенту", Icon: MessageSquare },
};

/**
 * Reader card for a system notification (PR/checks, automation runs, agent
 * approvals/questions). Renders the event title/context and a working primary
 * "go to source" action resolved from {@link InboxItem.systemAction}:
 *   - `open-pr`        → opens the PR URL in the browser,
 *   - `open-workspace` / `reply-agent` → navigates to the workspace,
 *   - `open-automation` → navigates to the automation detail.
 */
export function SystemEventCard({ item }: SystemEventCardProps) {
	const navigate = useNavigate();
	const action = item.systemAction;

	const goToSource = () => {
		if (action) openSystemSource(action, navigate);
	};

	const visual = action ? ACTION_VISUAL[action.kind] : null;

	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
			<div className="flex size-12 items-center justify-center rounded-full bg-white/5 text-muted-foreground">
				<Bell className="size-6" />
			</div>
			<div className="space-y-1">
				<h3 className="font-semibold text-foreground text-sm">{item.title}</h3>
				<p className="text-muted-foreground text-xs">{item.preview}</p>
				{item.timestamp && (
					<p className="font-mono text-[10px] text-muted-foreground tabular-nums">
						{formatRelativeTime(item.timestamp)}
					</p>
				)}
			</div>
			{visual && (
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="gap-1.5"
					onClick={goToSource}
				>
					<visual.Icon className="size-3.5" /> {visual.label}
				</Button>
			)}
		</div>
	);
}
