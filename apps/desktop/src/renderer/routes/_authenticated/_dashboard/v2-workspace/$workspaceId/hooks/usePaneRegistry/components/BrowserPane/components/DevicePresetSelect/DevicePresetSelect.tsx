import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { TbCheck, TbDeviceMobile } from "react-icons/tb";
import { DEVICE_PRESETS } from "shared/browser";

interface DevicePresetSelectProps {
	presetId: string;
	onSelect: (presetId: string) => void;
}

export function DevicePresetSelect({
	presetId,
	onSelect,
}: DevicePresetSelectProps) {
	const active = DEVICE_PRESETS.find((p) => p.id === presetId);
	const isMobile = active != null && active.id !== "responsive";

	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className={`rounded p-0.5 transition-colors ${isMobile ? "text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground"}`}
						>
							<TbDeviceMobile className="size-3.5" />
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Device preset{active ? `: ${active.label}` : ""}
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="end" className="min-w-[160px]">
				{DEVICE_PRESETS.map((preset) => (
					<DropdownMenuItem
						key={preset.id}
						onSelect={() => onSelect(preset.id)}
						className="flex items-center justify-between gap-2"
					>
						<span>{preset.label}</span>
						<span className="flex items-center gap-2">
							{preset.id !== "responsive" && (
								<span className="text-[10px] text-muted-foreground/50">
									{preset.width}×{preset.height}
								</span>
							)}
							{preset.id === presetId && <TbCheck className="size-3.5" />}
						</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
