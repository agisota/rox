import { cn } from "@rox/ui/utils";
import type { ComponentType, ReactNode } from "react";

export interface DashboardSurfaceProps {
	/** Surface title shown in the header. Omit for full-bleed surfaces (canvas). */
	title?: string;
	description?: string;
	icon?: ComponentType<{ className?: string }>;
	/** Optional toolbar rendered on the right of the header (buttons, dialogs). */
	actions?: ReactNode;
	/**
	 * Width strategy. "content" (default) caps at the shared `--container-content`
	 * token (kills the half-page empty margins); "full" lets the surface own the
	 * entire width (graph canvas, file managers, three-pane layouts).
	 */
	width?: "content" | "full";
	/** Drop the scroll container + padding for surfaces that manage their own (canvas). */
	bare?: boolean;
	children: ReactNode;
	className?: string;
}

/**
 * Canonical container for every dashboard surface (Pipelines, Drive, Calendar,
 * Notes, Email, Inbox, Journal, Memory, Skills, Prompts, Tasks, Settings, …).
 *
 * Single source of truth for surface width + header chrome so the per-surface
 * `max-w-5xl/6xl` hardcodes (which caused the half-page gutters) can never drift
 * back one surface at a time. `width="content"` uses the shared
 * `max-w-content` token; `width="full"` and `bare` are the escape hatches for
 * canvas / file-manager / multi-pane surfaces that own their layout.
 */
export function DashboardSurface({
	title,
	description,
	icon: Icon,
	actions,
	width = "content",
	bare = false,
	children,
	className,
}: DashboardSurfaceProps) {
	if (bare) {
		return <div className={cn("h-full min-h-0", className)}>{children}</div>;
	}

	return (
		<div className="h-full overflow-y-auto">
			<div
				className={cn(
					"w-full px-6 py-6",
					width === "content" ? "mx-auto max-w-content" : "max-w-none",
					className,
				)}
			>
				{(title || actions) && (
					<header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div className="min-w-0">
							{title && (
								<h1 className="flex min-w-0 items-center gap-2 font-semibold text-2xl text-foreground">
									{Icon && <Icon className="size-6 shrink-0 text-primary" />}
									{title}
								</h1>
							)}
							{description && (
								<p className="mt-1 text-muted-foreground text-sm">
									{description}
								</p>
							)}
						</div>
						{actions && (
							<div className="flex shrink-0 items-center gap-2">{actions}</div>
						)}
					</header>
				)}
				{children}
			</div>
		</div>
	);
}
