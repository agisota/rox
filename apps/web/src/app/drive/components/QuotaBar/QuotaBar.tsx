"use client";

import { Label } from "@rox/ui/label";
import { Progress } from "@rox/ui/progress";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { Switch } from "@rox/ui/switch";
import { cn } from "@rox/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { formatBytes } from "../../utils/formatBytes";
import { quotaView } from "./quotaView";

/**
 * Drive quota meter: used / 10 GiB. Cache-first — renders the last known quota
 * snapshot immediately and only shows a skeleton when there is no data yet.
 *
 * The overage toggle (finding D1) is the ONLY way to reach the DQ2 soft-meter:
 * with it off, uploads hard-block at the cap; with it on, uploads past the cap
 * proceed and accrue billed overage.
 */
export function QuotaBar() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const quota = useQuery(trpc.drive.quota.queryOptions());

	const setOverage = useMutation(
		trpc.drive.setOverageOptIn.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.drive.quota.queryKey(),
				});
			},
			onError: (error) => {
				toast.error(error.message || "Не удалось изменить настройку overage");
			},
		}),
	);

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
			<div className="flex items-center justify-between pt-1">
				<Label
					htmlFor="drive-overage-toggle"
					className="text-muted-foreground text-xs"
				>
					Разрешить загрузки сверх лимита (оплата overage)
				</Label>
				<Switch
					id="drive-overage-toggle"
					checked={quota.data.overageOptIn}
					disabled={setOverage.isPending}
					onCheckedChange={(checked) => setOverage.mutate({ optIn: checked })}
				/>
			</div>
		</div>
	);
}
