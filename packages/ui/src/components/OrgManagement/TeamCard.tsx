import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface TeamCardProps {
	name: string;
	/** Localized "created on" / member-count subtitle. */
	subtitle?: string;
	onClick?: () => void;
	/** Trailing slot (chevron, member avatars, actions). */
	trailing?: ReactNode;
	className?: string;
}

/**
 * Presentation-only team list item shared by web and desktop teams panels
 * (Hermes-borrow F27). Renders as a button when `onClick` is provided so both
 * the web (router push) and desktop (TanStack Router navigate) hosts can wire
 * navigation themselves.
 */
export function TeamCard({
	name,
	subtitle,
	onClick,
	trailing,
	className,
}: TeamCardProps) {
	const content = (
		<>
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium">{name}</p>
				{subtitle ? (
					<p className="truncate text-muted-foreground text-sm">{subtitle}</p>
				) : null}
			</div>
			{trailing}
		</>
	);

	const baseClassName = cn(
		"flex w-full items-center gap-4 p-4 text-left",
		onClick && "cursor-pointer transition-colors hover:bg-accent/50",
		className,
	);

	if (onClick) {
		return (
			<button type="button" onClick={onClick} className={baseClassName}>
				{content}
			</button>
		);
	}

	return <div className={baseClassName}>{content}</div>;
}
