import { AnimatedNumber, CollapseLabel } from "@rox/ui/motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import type { ComponentType } from "react";

export interface DashboardSidebarNavButtonProps {
	label: string;
	icon: ComponentType<{ className?: string }>;
	isActive: boolean;
	isCollapsed: boolean;
	onClick: () => void;
	onboardingAnchor?: string;
	/**
	 * Optional unread badge. Expanded: a glass `tabular-nums` pill (`>99 → 99+`)
	 * that springs on increment via {@link AnimatedNumber}. Collapsed: a small
	 * dot overlaid on the icon. `0`/`undefined` renders nothing.
	 */
	badgeCount?: number;
}

/** Glass pill shared by both layouts. `99+` caps the visible count. */
const BADGE_PILL =
	"min-w-[1.125rem] rounded-full bg-white/10 px-1.5 py-px text-center font-mono text-[10px] text-foreground tabular-nums leading-tight";

function formatBadge(value: number): string {
	const n = Math.round(value);
	return n > 99 ? "99+" : String(n);
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
	onboardingAnchor,
	badgeCount,
}: DashboardSidebarNavButtonProps) {
	const hasBadge = (badgeCount ?? 0) > 0;

	if (isCollapsed) {
		return (
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						data-onboarding-anchor={onboardingAnchor}
						aria-label={
							hasBadge ? `${label} (${formatBadge(badgeCount ?? 0)})` : label
						}
						onClick={onClick}
						className={cn(
							"relative flex size-8 items-center justify-center rounded-md transition-colors",
							isActive
								? "bg-accent text-foreground"
								: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
						)}
					>
						<Icon className="size-4" />
						{hasBadge && (
							<span
								aria-hidden
								className="absolute top-1 right-1 size-1.5 rounded-full bg-foreground"
							/>
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">{label}</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<button
			type="button"
			data-onboarding-anchor={onboardingAnchor}
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
			{hasBadge && (
				<AnimatedNumber
					value={badgeCount ?? 0}
					format={formatBadge}
					className={cn(BADGE_PILL, "shrink-0")}
				/>
			)}
		</button>
	);
}
