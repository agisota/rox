import { LuTarget } from "react-icons/lu";
import type { ChatPaneData } from "../../../../types";
import type { SidebarTabDefinition } from "../../types";
import { GovernanceTabContent } from "./components/GovernanceTabContent";
import { useGovernanceItems } from "./useGovernanceItems";

interface UseGovernanceTabParams {
	workspaceId: string;
	onOpenChat: (launchConfig?: ChatPaneData["launchConfig"]) => void;
}

/**
 * Builds the "Управление" right-panel tab: three stacked governance sections
 * (ЦЕЛИ / ЗАДАЧИ / МИССИИ). The badge reflects the total item count so the
 * user can see governance density without opening the tab.
 */
export function useGovernanceTab({
	workspaceId,
	onOpenChat,
}: UseGovernanceTabParams): SidebarTabDefinition {
	const { totalCount } = useGovernanceItems(workspaceId);

	return {
		id: "governance",
		label: "Управление",
		icon: LuTarget,
		badge: totalCount > 0 ? totalCount : undefined,
		content: (
			<GovernanceTabContent workspaceId={workspaceId} onOpenChat={onOpenChat} />
		),
	};
}
