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
	className?: string;
}

/**
 * Renders a model's capabilities as small icon chips with tooltips (vision,
 * tool-use, long-context, …) plus an optional context-window chip. Icon-only
 * keeps the list dense; the tooltip carries the human-readable RU label.
 */
export function ModelCapabilityBadges({
	capabilities,
	contextWindowLabel,
	className,
}: ModelCapabilityBadgesProps) {
	if (capabilities.length === 0 && !contextWindowLabel) return null;

	return (
		<div className={cn("flex flex-wrap items-center gap-1", className)}>
			{contextWindowLabel ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
							{contextWindowLabel}
						</span>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={4} showArrow={false}>
						Размер контекста: {contextWindowLabel} токенов
					</TooltipContent>
				</Tooltip>
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
