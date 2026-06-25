import { cn } from "@rox/ui/utils";

/**
 * Small colored format badge shown in the top-right corner of a preview view
 * (PDF / CSV / HTML). Purely presentational — the color encodes the format so
 * the user can tell at a glance which renderer is active.
 */
export interface FormatBadgeProps {
	label: string;
	/** Tailwind classes for the badge background/text color. */
	colorClassName: string;
	className?: string;
}

export function FormatBadge({
	label,
	colorClassName,
	className,
}: FormatBadgeProps) {
	return (
		<span
			className={cn(
				"pointer-events-none absolute top-2 right-2 z-10 inline-flex items-center rounded-full px-2 py-0.5 font-medium text-[10px] uppercase tracking-wider shadow-sm",
				colorClassName,
				className,
			)}
		>
			{label}
		</span>
	);
}
