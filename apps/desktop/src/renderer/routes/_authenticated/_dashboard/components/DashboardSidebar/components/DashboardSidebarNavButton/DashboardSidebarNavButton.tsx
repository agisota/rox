import { CollapseLabel } from "@rox/ui/motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import type { ComponentType } from "react";

export interface DashboardSidebarNavButtonProps {
	label: string;
	icon: ComponentType<{ className?: string }>;
	isActive: boolean;
	isCollapsed: boolean;
	onClick: () => void;
}

/**
 * A single destination button in the dashboard sidebar's bottom navigation
 * stack (Canvas / Journal / Memory / the Workspace Suite). Extracted so the
 * collapsed (icon + tooltip) vs. expanded (icon + label) rendering — previously
 * duplicated inline per destination — lives in one place and every new
 * destination stays visually consistent.
 */
export function DashboardSidebarNavButton({
	label,
	icon: Icon,
	isActive,
	isCollapsed,
	onClick,
}: DashboardSidebarNavButtonProps) {
	if (isCollapsed) {
		return (
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={label}
						onClick={onClick}
						className={cn(
							"flex size-8 items-center justify-center rounded-md transition-colors",
							isActive
								? "bg-accent text-foreground"
								: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
						)}
					>
						<Icon className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">{label}</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"group flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 font-medium text-sm transition-colors",
				isActive
					? "bg-accent text-foreground"
					: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
			)}
		>
			<Icon className="size-4 shrink-0" />
			<CollapseLabel show={!isCollapsed} className="flex-1 text-left">
				{label}
			</CollapseLabel>
		</button>
	);
}
