import { ScrollArea } from "@rox/ui/scroll-area";
import { useCallback } from "react";
import {
	buildGovernanceDiscussPrompt,
	buildGovernanceExecutePrompt,
	GOVERNANCE_KINDS,
	type WorkspaceGovernanceItemRow,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import type { ChatPaneData } from "../../../../../../types";
import { useGovernanceItems } from "../../useGovernanceItems";
import { GovernanceSection } from "../GovernanceSection";

interface GovernanceTabContentProps {
	workspaceId: string;
	/**
	 * Opens a fresh chat pane with an optional launch config. Reused for both
	 * the PLAY action (a new chat-branch executing the item) and the secondary
	 * "Обсудить с AI" action (a plain chat seeded with the item text).
	 */
	onOpenChat: (launchConfig?: ChatPaneData["launchConfig"]) => void;
}

/**
 * The "Управление" tab body: three stacked governance sections — ЦЕЛИ / ЗАДАЧИ
 * / МИССИИ. Each section can add items inline; each row plays into a new
 * chat-branch (default model) or opens a discussion chat.
 */
export function GovernanceTabContent({
	workspaceId,
	onOpenChat,
}: GovernanceTabContentProps) {
	const { itemsByKind, addItem, removeItem } = useGovernanceItems(workspaceId);

	const handlePlay = useCallback(
		(item: WorkspaceGovernanceItemRow) => {
			// New chat-branch: omit `model` so the chat resolves the user's
			// selected/default model (see ChatPaneInterface auto-launch). The
			// prompt frames the item text as an execution directive.
			onOpenChat({
				initialPrompt: buildGovernanceExecutePrompt(item.kind, item.text),
			});
		},
		[onOpenChat],
	);

	const handleDiscuss = useCallback(
		(item: WorkspaceGovernanceItemRow) => {
			// Open a chat without an execution frame — discuss, don't branch-run.
			onOpenChat({
				initialPrompt: buildGovernanceDiscussPrompt(item.kind, item.text),
			});
		},
		[onOpenChat],
	);

	return (
		<ScrollArea className="h-full min-h-0">
			<div className="flex flex-col pb-4">
				{GOVERNANCE_KINDS.map((kind) => (
					<GovernanceSection
						key={kind}
						kind={kind}
						items={itemsByKind[kind]}
						onAdd={addItem}
						onPlay={handlePlay}
						onDiscuss={handleDiscuss}
						onRemove={(item) => removeItem(item.id)}
					/>
				))}
			</div>
		</ScrollArea>
	);
}
