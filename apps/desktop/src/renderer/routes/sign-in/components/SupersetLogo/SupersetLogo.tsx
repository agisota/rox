import { COMPANY } from "@superset/shared/constants";
import { cn } from "@superset/ui/utils";

interface SupersetLogoProps {
	className?: string;
	gradient?: boolean;
}

export function SupersetLogo({
	className,
	gradient = false,
}: SupersetLogoProps) {
	return (
		<div
			className={cn(
				"flex items-center text-2xl font-semibold tracking-tight text-foreground",
				gradient &&
					"bg-gradient-to-r from-foreground/60 via-foreground to-foreground/60 bg-clip-text text-transparent",
				className,
			)}
		>
			{COMPANY.NAME}
		</div>
	);
}
