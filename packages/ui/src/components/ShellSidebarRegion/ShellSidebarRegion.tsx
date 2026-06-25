"use client";

import { MIN_TOUCH_TARGET_PX } from "@rox/shared/breakpoints";
import { MenuIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "../../lib/utils";
import { useShouldAnimate } from "../../motion";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "../ui/sheet";

/**
 * ShellSidebarRegion — left workspace sidebar region of the responsive cascade
 * (F05, Hermes-borrow #639).
 *
 * The 3-region shell's LEFT region. It reflows the SAME children — there is no
 * separate mobile tree — between two presentations driven by the shared tier
 * cascade (`@rox/shared/breakpoints`):
 *
 * - `docked`  (wide / tablet): the sidebar sits in-flow inside the shell row,
 *   exactly as before. The host supplies the docked node (it owns resizing).
 * - `drawer`  (phone): the rail collapses to a hamburger trigger and the same
 *   sidebar content moves into a left slide-in `Sheet`. Only the open drawer
 *   casts a shadow (the `Sheet` content's `shadow-lg`); the docked rail never
 *   does. The trigger is sized to the 44px minimum touch target from the core.
 *
 * Reduced motion: the slide is owned by the `Sheet`/Radix `data-state`
 * animations; this component gates its own affordance fade on
 * `useShouldAnimate('decorative')` so reduced-motion users get an instant swap.
 *
 * Surfaces (desktop lead, web) pass their own `dockedSidebar` and the drawer
 * `children`; both come from the same source so wide and phone never diverge.
 */
export interface ShellSidebarRegionProps {
	/**
	 * Whether the region is on the phone (drawer) tier. Hosts pass
	 * `cascade.sidebar === "drawer"` so the breakpoint policy stays in the core.
	 */
	readonly asDrawer: boolean;
	/** The in-flow docked sidebar node, rendered as-is on wide / tablet. */
	readonly dockedSidebar: React.ReactNode;
	/** The sidebar content for the phone drawer (same logical sidebar). */
	readonly children: React.ReactNode;
	/** Controlled open state of the phone drawer. */
	readonly drawerOpen: boolean;
	/** Toggle the phone drawer open/closed. */
	readonly onDrawerOpenChange: (open: boolean) => void;
	/** Optional accessible label for the hamburger trigger. */
	readonly triggerLabel?: string;
}

export function ShellSidebarRegion({
	asDrawer,
	dockedSidebar,
	children,
	drawerOpen,
	onDrawerOpenChange,
	triggerLabel = "Open navigation",
}: ShellSidebarRegionProps) {
	const shouldAnimate = useShouldAnimate("decorative");

	if (!asDrawer) {
		// Wide / tablet: identical docked rail, in-flow. No drawer, no shadow.
		return <>{dockedSidebar}</>;
	}

	// Phone: rail → hamburger + slide-in drawer over the same content.
	return (
		<>
			<button
				type="button"
				aria-label={triggerLabel}
				aria-expanded={drawerOpen}
				onClick={() => onDrawerOpenChange(true)}
				style={{
					minWidth: MIN_TOUCH_TARGET_PX,
					minHeight: MIN_TOUCH_TARGET_PX,
				}}
				className={cn(
					"text-sidebar-foreground hover:bg-sidebar-accent focus-visible:ring-ring inline-flex shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-hidden",
					shouldAnimate ? "transition-colors" : undefined,
				)}
			>
				<MenuIcon className="size-5" />
			</button>
			<Sheet open={drawerOpen} onOpenChange={onDrawerOpenChange}>
				<SheetContent
					side="left"
					data-slot="shell-sidebar-drawer"
					className="bg-sidebar text-sidebar-foreground w-[var(--shell-sidebar-drawer-width,18rem)] p-0"
				>
					<SheetHeader className="sr-only">
						<SheetTitle>Navigation</SheetTitle>
						<SheetDescription>Workspace navigation sidebar.</SheetDescription>
					</SheetHeader>
					<div className="flex h-full w-full flex-col">{children}</div>
				</SheetContent>
			</Sheet>
		</>
	);
}
