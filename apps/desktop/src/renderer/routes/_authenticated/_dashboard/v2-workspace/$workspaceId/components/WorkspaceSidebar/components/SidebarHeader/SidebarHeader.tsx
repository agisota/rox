import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import { getSidebarHeaderTabButtonClassName } from "renderer/screens/main/components/WorkspaceView/RightSidebar/headerTabStyles";
import type { SidebarTabDefinition } from "../../types";
import { TabBadge } from "./TabBadge";

interface SidebarHeaderProps {
	tabs: SidebarTabDefinition[];
	activeTab: string;
	onTabChange: (id: string) => void;
	compact?: boolean;
}

export function SidebarHeader({
	tabs,
	activeTab,
	onTabChange,
	compact,
}: SidebarHeaderProps) {
	const actions = tabs.find((t) => t.id === activeTab)?.actions;

	return (
		<div className="flex h-10 shrink-0 items-stretch border-b border-border">
			<div className="flex min-w-0 items-center h-full overflow-hidden">
				{tabs.map((tab) => {
					const isActive = activeTab === tab.id;
					const badge =
						typeof tab.badge === "number" && tab.badge > 0
							? formatBadgeCount(tab.badge)
							: null;
					const label = badge ? `${tab.label} (${badge})` : tab.label;
					const btn = (
						<button
							key={tab.id}
							type="button"
							onClick={() => onTabChange(tab.id)}
							aria-label={label}
							className={cn(
								getSidebarHeaderTabButtonClassName({
									isActive,
									compact,
								}),
								"relative",
							)}
						>
							{tab.icon && <tab.icon className="size-3" />}
							{!compact && tab.label}
							{typeof tab.badge === "number" && tab.badge > 0 && (
								<TabBadge
									count={tab.badge}
									isActive={isActive}
									compact={compact}
								/>
							)}
						</button>
					);

					if (compact) {
						return (
							<Tooltip key={tab.id}>
								<TooltipTrigger asChild>{btn}</TooltipTrigger>
								<TooltipContent side="bottom" showArrow={false}>
									{label}
								</TooltipContent>
							</Tooltip>
						);
					}

					return btn;
				})}
			</div>
			<div className="flex-1" />
			{actions && (
				<div className="flex shrink-0 items-center h-10 pr-2 gap-0.5">
					{actions}
				</div>
			)}
		</div>
	);
}

function formatBadgeCount(count: number): string {
	return count > 99 ? "99+" : String(count);
}
