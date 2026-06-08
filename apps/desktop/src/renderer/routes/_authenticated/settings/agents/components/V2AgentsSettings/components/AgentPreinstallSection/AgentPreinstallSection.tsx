import type { PreinstallStatusEntry } from "@rox/host-service/settings";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Skeleton } from "@rox/ui/skeleton";
import { cn } from "@rox/ui/utils";
import {
	CheckCircle2,
	CircleDashed,
	Download,
	Loader2,
	MinusCircle,
	TriangleAlert,
} from "lucide-react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useAgentPreinstall } from "./useAgentPreinstall";

type StatusMeta = {
	label: string;
	variant: "default" | "secondary" | "destructive" | "outline";
	icon: typeof CheckCircle2;
	spin?: boolean;
	className?: string;
};

const STATUS_META: Record<PreinstallStatusEntry["status"], StatusMeta> = {
	installed: {
		label: "Installed",
		variant: "secondary",
		icon: CheckCircle2,
		className: "text-emerald-600 dark:text-emerald-400",
	},
	installing: {
		label: "Installing",
		variant: "outline",
		icon: Loader2,
		spin: true,
	},
	pending: { label: "Pending", variant: "outline", icon: CircleDashed },
	failed: { label: "Failed", variant: "destructive", icon: TriangleAlert },
	skipped: { label: "Skipped", variant: "outline", icon: MinusCircle },
};

const KIND_LABEL: Record<PreinstallStatusEntry["kind"], string> = {
	agent: "Agent",
	harness: "Harness",
};

/**
 * Surfaces the bundled agent/harness preinstaller in Settings → Agents. Lists
 * every catalog item with live install status, an "Install all" action for
 * pending items, and per-item retry/skip. Polling lives in the hook; this is a
 * thin status-driven renderer.
 */
export function AgentPreinstallSection() {
	const { activeHostUrl } = useLocalHostService();
	const isDark = useIsDarkTheme();
	const {
		entries,
		isLoading,
		isError,
		error,
		pendingCount,
		failedCount,
		isInstalling,
		runAll,
		retry,
		skip,
		isRunningAll,
		pendingActionPresetId,
	} = useAgentPreinstall(activeHostUrl);

	if (isError) {
		return (
			<section className="rounded-lg border border-border p-4">
				<SectionHeader />
				<p className="mt-2 text-xs text-destructive">
					Couldn't load install status:{" "}
					{error instanceof Error ? error.message : "host service unavailable"}
				</p>
			</section>
		);
	}

	const canInstall = pendingCount > 0 || failedCount > 0;

	return (
		<section className="rounded-lg border border-border divide-y divide-border">
			<div className="flex items-start justify-between gap-3 p-4">
				<SectionHeader />
				<Button
					size="sm"
					variant="outline"
					disabled={
						!activeHostUrl || !canInstall || isRunningAll || isInstalling
					}
					onClick={() => runAll()}
				>
					{isInstalling || isRunningAll ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Download className="size-4" />
					)}
					Install all
				</Button>
			</div>

			{isLoading ? (
				<RowsSkeleton />
			) : entries.length === 0 ? (
				<p className="p-4 text-xs text-muted-foreground">
					No bundled agents or harnesses to install.
				</p>
			) : (
				<ul className="divide-y divide-border">
					{entries.map((entry) => (
						<PreinstallRow
							key={entry.presetId}
							entry={entry}
							isDark={isDark}
							busy={pendingActionPresetId === entry.presetId}
							onRetry={() => retry(entry.presetId)}
							onSkip={() => skip(entry.presetId)}
						/>
					))}
				</ul>
			)}
		</section>
	);
}

function SectionHeader() {
	return (
		<div className="min-w-0">
			<h3 className="text-sm font-medium">Bundled installs</h3>
			<p className="mt-0.5 text-xs text-muted-foreground">
				Install the bundled agent CLIs and harnesses on this device. Runs in the
				background; retry any that fail.
			</p>
		</div>
	);
}

interface PreinstallRowProps {
	entry: PreinstallStatusEntry;
	isDark: boolean;
	busy: boolean;
	onRetry: () => void;
	onSkip: () => void;
}

function PreinstallRow({
	entry,
	isDark,
	busy,
	onRetry,
	onSkip,
}: PreinstallRowProps) {
	const meta = STATUS_META[entry.status];
	const StatusIcon = meta.icon;
	const icon = getPresetIcon(entry.presetId, isDark);
	const isInstalling = entry.status === "installing";
	const canRetry =
		entry.status !== "installing" && entry.status !== "installed";
	const canSkip = entry.status === "pending" || entry.status === "failed";

	return (
		<li className="flex items-center gap-3 p-3">
			<div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
				{icon ? (
					<img alt="" src={icon} className="size-4" />
				) : (
					<Download aria-hidden className="size-3.5 text-muted-foreground" />
				)}
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-sm font-medium">{entry.label}</span>
					<Badge variant="outline" className="text-[10px] font-normal">
						{KIND_LABEL[entry.kind]}
					</Badge>
					{entry.optional ? (
						<Badge variant="outline" className="text-[10px] font-normal">
							Optional
						</Badge>
					) : null}
				</div>
				{entry.status === "failed" && entry.lastError ? (
					<p className="mt-0.5 truncate text-xs text-destructive">
						{entry.lastError}
					</p>
				) : entry.version ? (
					<p className="mt-0.5 truncate text-xs text-muted-foreground">
						{entry.version}
					</p>
				) : null}
			</div>

			<Badge variant={meta.variant} className="shrink-0">
				<StatusIcon
					className={cn("size-3", meta.spin && "animate-spin", meta.className)}
				/>
				{meta.label}
			</Badge>

			<div className="flex shrink-0 items-center gap-1">
				{canSkip ? (
					<Button
						size="xs"
						variant="ghost"
						disabled={busy || isInstalling}
						onClick={onSkip}
					>
						Skip
					</Button>
				) : null}
				{canRetry ? (
					<Button
						size="xs"
						variant="outline"
						disabled={busy || isInstalling}
						onClick={onRetry}
					>
						{busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
						{entry.status === "failed" ? "Retry" : "Install"}
					</Button>
				) : null}
			</div>
		</li>
	);
}

function RowsSkeleton() {
	return (
		<div className="space-y-3 p-4">
			{[0, 1, 2].map((i) => (
				<Skeleton key={i} className="h-9 w-full" />
			))}
		</div>
	);
}
