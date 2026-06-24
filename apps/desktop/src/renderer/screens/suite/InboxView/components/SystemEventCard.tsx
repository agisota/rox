import { Button } from "@rox/ui/button";
import { Bell, ExternalLink } from "lucide-react";
import type { InboxItem } from "../types";
import { formatRelativeTime } from "../utils/inboxTime";

export interface SystemEventCardProps {
	item: InboxItem;
}

/**
 * Reader card for a system notification (PR/checks, automation runs, agent
 * approvals/questions). The system-events aggregator is a LATER (P1) phase — the
 * merge in `useInboxData` does not yet emit `source: "system"` rows — so this is
 * the forward-compatible reader the panel routes to once those rows exist. It
 * shows the event title, context, and a primary "open source" action.
 */
export function SystemEventCard({ item }: SystemEventCardProps) {
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
			<Button size="sm" variant="outline" className="gap-1.5">
				<ExternalLink className="size-3.5" /> Открыть источник
			</Button>
		</div>
	);
}
