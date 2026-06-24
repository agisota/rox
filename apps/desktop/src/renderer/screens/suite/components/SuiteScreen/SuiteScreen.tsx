import { cn } from "@rox/ui/utils";
import type { ComponentType, ReactNode } from "react";

export interface SuiteScreenProps {
	title: string;
	description?: string;
	icon?: ComponentType<{ className?: string }>;
	/** Optional toolbar rendered on the right of the header (buttons, dialogs). */
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
}

/**
 * Shared shell for the Workspace Suite screens (Drive / Calendar / Notes /
 * Email). Mirrors the existing dashboard screen idiom (journal/pipelines): a
 * scrollable column, a centred max-width header with title + description, and an
 * optional right-aligned action slot. Keeps the four views visually consistent
 * without each re-implementing the same header markup.
 */
export function SuiteScreen({
	title,
	description,
	icon: Icon,
	actions,
	children,
	className,
}: SuiteScreenProps) {
	return (
		<div className="h-full overflow-y-auto">
			<div className={cn("mx-auto w-full max-w-content px-6 py-6", className)}>
				<header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0">
						<h1 className="flex min-w-0 items-center gap-2 font-semibold text-2xl text-foreground">
							{Icon && <Icon className="size-6 shrink-0 text-primary" />}
							{title}
						</h1>
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
				{children}
			</div>
		</div>
	);
}
