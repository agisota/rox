"use client";

import { Progress } from "@rox/ui/progress";
import { Skeleton } from "@rox/ui/skeleton";
import { cn } from "@rox/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { formatBytes } from "../../utils/formatBytes";
import { quotaView } from "./quotaView";

/**
 * Drive quota meter: used / 10 GiB. Cache-first — renders the last known quota
 * snapshot immediately and only shows a skeleton when there is no data yet.
 */
export function QuotaBar() {
	const trpc = useTRPC();
	const quota = useQuery(trpc.drive.quota.queryOptions());

	if (!quota.data) {
		if (quota.isLoading) {
			return <Skeleton className="h-12 w-full rounded-lg" />;
		}
		return null;
	}

	const view = quotaView(quota.data);

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between text-sm">
				<span className="font-medium text-foreground">Хранилище</span>
				<span className="text-muted-foreground tabular-nums">
					{formatBytes(quota.data.bytesUsed)} из{" "}
					{formatBytes(quota.data.quotaBytes)}
				</span>
			</div>
			<Progress
				value={view.percent}
				className={cn(
					view.tone === "warning" && "[&>div]:bg-amber-500",
					view.tone === "over" && "[&>div]:bg-destructive",
				)}
			/>
			{view.isOver ? (
				<p className="text-destructive text-xs">
					Превышение на {formatBytes(view.overBytes)}
					{quota.data.overageOptIn
						? " — оплачивается как overage."
						: " — освободите место для новых загрузок."}
				</p>
			) : null}
		</div>
	);
}
