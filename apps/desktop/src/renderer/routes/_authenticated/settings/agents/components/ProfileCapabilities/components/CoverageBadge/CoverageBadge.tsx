import { Badge } from "@rox/ui/badge";

export interface CoverageBadgeProps {
	enabled: number;
	total: number;
}

/**
 * `enabled/total` coverage badge (F47, #644). Neutral when nothing is enabled,
 * accented once at least one capability is on.
 */
export function CoverageBadge({ enabled, total }: CoverageBadgeProps) {
	return (
		<Badge variant={enabled > 0 ? "default" : "secondary"}>
			{enabled}/{total}
		</Badge>
	);
}
