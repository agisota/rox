import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import {
	BrainIcon,
	EyeIcon,
	FileTextIcon,
	ImageIcon,
	type LucideIcon,
	VideoIcon,
	WrenchIcon,
} from "lucide-react";
import {
	CAPABILITY_LABELS,
	createContextUsageSnapshot,
	formatTokenCount,
	type ModelCapability,
} from "../../utils/modelCapabilities";

const CAPABILITY_ICONS: Record<ModelCapability, LucideIcon> = {
	vision: EyeIcon,
	imageGen: ImageIcon,
	video: VideoIcon,
	tools: WrenchIcon,
	longContext: FileTextIcon,
	reasoning: BrainIcon,
};

interface ModelCapabilityBadgesProps {
	capabilities: ModelCapability[];
	/** Optional context-window label (e.g. `256K`) shown as a leading chip. */
	contextWindowLabel?: string | null;
	contextWindowTokens?: number | null;
	className?: string;
}

export function ContextUsageChip({
	contextWindowLabel,
	contextWindowTokens,
	className,
}: {
	contextWindowLabel: string;
	contextWindowTokens: number;
	className?: string;
}) {
	const snapshot = createContextUsageSnapshot({
		maxTokens: contextWindowTokens,
	});
	const usedPercentLabel = `${Math.round(snapshot.usedPercent)}%`;

	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<button
							type="button"
							className={cn(
								"rounded-full bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground transition-colors hover:bg-foreground/[0.1] hover:text-foreground",
								className,
							)}
							aria-label={`Context usage: ${contextWindowLabel}`}
						>
							{contextWindowLabel}
						</button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="top" sideOffset={4} showArrow={false}>
					Контекстное окно: {contextWindowLabel}. Нажмите для детализации.
				</TooltipContent>
			</Tooltip>
			<PopoverContent align="start" className="w-[22rem] p-0 overflow-hidden">
				<div className="border-border/60 border-b px-4 py-3">
					<div className="flex items-start justify-between gap-3">
						<div>
							<h4 className="font-medium text-[13px] text-foreground">
								Context Usage
							</h4>
							<p className="mt-1 text-[11px] text-muted-foreground">
								Breakdown by prompt entity inside the model context window.
							</p>
						</div>
						<div className="font-mono text-[11px] text-muted-foreground">
							{formatTokenCount(snapshot.usedTokens)} /{" "}
							{formatTokenCount(snapshot.maxTokens)} Tokens
						</div>
					</div>
					<div className="mt-3">
						<div className="mb-1.5 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
							<span>{usedPercentLabel} Full</span>
							<span>
								{snapshot.source === "runtime" ? "Live" : "Telemetry pending"}
							</span>
						</div>
						<div className="flex h-2 overflow-hidden rounded-full bg-foreground/[0.08]">
							{snapshot.segments.map((segment) =>
								segment.tokens > 0 ? (
									<div
										key={segment.id}
										className="h-full"
										style={{
											backgroundColor: segment.color,
											width: `${Math.max(segment.percent, 0.75)}%`,
										}}
									/>
								) : null,
							)}
						</div>
					</div>
				</div>
				<div className="space-y-2 px-4 py-3">
					{snapshot.segments.map((segment) => (
						<div
							key={segment.id}
							className="grid grid-cols-[1rem_1fr_auto] items-center gap-2 text-[12px]"
						>
							<span
								className="size-2.5 rounded-[3px]"
								style={{ backgroundColor: segment.color }}
								aria-hidden
							/>
							<span className="text-muted-foreground">{segment.label}</span>
							<span className="font-mono text-muted-foreground">
								{formatTokenCount(segment.tokens)}
							</span>
						</div>
					))}
					{snapshot.source === "capacity-only" ? (
						<p className="border-border/60 border-t pt-2 text-[11px] text-muted-foreground">
							Runtime accounting is not attached to this picker yet; the data
							model already preserves prompt entities so live chat/session
							telemetry can fill these rows without changing the UI.
						</p>
					) : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}

/**
 * Renders a model's capabilities as small icon chips with tooltips (vision,
 * tool-use, long-context, …) plus an optional context-window chip. Icon-only
 * keeps the list dense; the tooltip carries the human-readable RU label.
 */
export function ModelCapabilityBadges({
	capabilities,
	contextWindowLabel,
	contextWindowTokens,
	className,
}: ModelCapabilityBadgesProps) {
	if (capabilities.length === 0 && !contextWindowLabel) return null;

	return (
		<div className={cn("flex flex-wrap items-center gap-1", className)}>
			{contextWindowLabel && contextWindowTokens ? (
				<ContextUsageChip
					contextWindowLabel={contextWindowLabel}
					contextWindowTokens={contextWindowTokens}
				/>
			) : contextWindowLabel ? (
				<span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
					{contextWindowLabel}
				</span>
			) : null}
			{capabilities.map((capability) => {
				const Icon = CAPABILITY_ICONS[capability];
				const label = CAPABILITY_LABELS[capability];
				return (
					<Tooltip key={capability}>
						<TooltipTrigger asChild>
							<span
								className="flex size-4 items-center justify-center rounded-full bg-foreground/[0.06] text-muted-foreground"
								role="img"
								aria-label={label}
							>
								<Icon className="size-2.5" aria-hidden />
							</span>
						</TooltipTrigger>
						<TooltipContent side="top" sideOffset={4} showArrow={false}>
							{label}
						</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);
}
