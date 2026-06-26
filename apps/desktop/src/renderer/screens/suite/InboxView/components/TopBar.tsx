import { Button } from "@rox/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@rox/ui/toggle-group";
import { MessageSquarePlus, PenSquare } from "lucide-react";
import type { InboxStatusFilter } from "../types";

export interface TopBarProps {
	status: InboxStatusFilter;
	onStatusChange: (status: InboxStatusFilter) => void;
	onCompose: () => void;
	onNewChat: () => void;
}

/**
 * The bar above panels 2+3: a primary Непрочитанные/Все status segment
 * (duplicating the rail toggle for reach) plus the two compose entries —
 * «Написать» (new email) and «Новая переписка» (new chat).
 */
export function TopBar({
	status,
	onStatusChange,
	onCompose,
	onNewChat,
}: TopBarProps) {
	return (
		<div className="flex shrink-0 items-center justify-between gap-3 pb-3">
			<ToggleGroup
				type="single"
				value={status}
				onValueChange={(next) => {
					if (next) onStatusChange(next as InboxStatusFilter);
				}}
			>
				<ToggleGroupItem value="unread" className="text-xs">
					Непрочитанные
				</ToggleGroupItem>
				<ToggleGroupItem value="all" className="text-xs">
					Все
				</ToggleGroupItem>
			</ToggleGroup>

			<div className="flex items-center gap-2">
				<Button variant="outline" size="sm" onClick={onNewChat}>
					<MessageSquarePlus className="size-4" /> Новая переписка
				</Button>
				<Button size="sm" onClick={onCompose}>
					<PenSquare className="size-4" /> Написать
				</Button>
			</div>
		</div>
	);
}
