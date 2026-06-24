import { Label } from "@rox/ui/label";
import { AnimatedNumber } from "@rox/ui/motion";
import { Progress } from "@rox/ui/progress";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { Switch } from "@rox/ui/switch";
import { cn } from "@rox/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { formatFileSize } from "../../utils/formatFileSize";
import { quotaView } from "../utils/quotaView";

/**
 * Sticky storage meter for the Drive left rail (used / 10 GiB). Ported from the
 * web `QuotaBar` and given desktop glass + an {@link AnimatedNumber} percent
 * that springs on change with a bar-color tween across thresholds.
 *
 * Cache-first (AGENTS.md #9): renders the last known snapshot immediately and
 * shows a skeleton only when there is genuinely no data yet. The overage toggle
 * is the only path to the soft-meter: off → uploads hard-block at the cap; on →
 * uploads past the cap proceed and accrue billed overage.
 */
export function QuotaCard() {
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
			return <Skeleton className="h-24 w-full rounded-lg" />;
		}
		return null;
	}

	const view = quotaView(quota.data);

	return (
		<div className="glass-panel space-y-2 rounded-lg border border-border/60 p-3">
			<div className="flex items-center justify-between text-sm">
				<span className="font-medium text-foreground">Хранилище</span>
				<span className="text-muted-foreground text-xs tabular-nums">
					<AnimatedNumber
						value={view.percent}
						format={(v) => `${Math.round(v)}%`}
					/>
				</span>
			</div>
			<Progress
				value={view.percent}
				className={cn(
					"transition-colors",
					view.tone === "warning" &&
						"[&_[data-slot=progress-indicator]]:bg-amber-500",
					view.tone === "over" &&
						"[&_[data-slot=progress-indicator]]:bg-destructive",
				)}
			/>
			<p className="text-muted-foreground text-xs tabular-nums">
				{formatFileSize(quota.data.bytesUsed)} из{" "}
				{formatFileSize(quota.data.quotaBytes)}
			</p>
			{view.isOver ? (
				<p className="text-destructive text-xs">
					Превышение на {formatFileSize(view.overBytes)}
					{quota.data.overageOptIn
						? " — оплачивается как overage."
						: " — освободите место для новых загрузок."}
				</p>
			) : null}
			<div className="flex items-center justify-between gap-2 pt-1">
				<Label
					htmlFor="drive-overage-toggle"
					className="text-[11px] text-muted-foreground leading-tight"
				>
					Загрузки сверх лимита (overage)
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
