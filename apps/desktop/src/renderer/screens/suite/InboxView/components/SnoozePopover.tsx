import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { cn } from "@rox/ui/utils";
import type { ReactNode } from "react";
import { SNOOZE_PRESETS } from "../utils/triageStore";
import { GLASS_PANEL } from "./glass";

export interface SnoozePopoverProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** Trigger element (a hover button or a kebab item wrapper). */
	children: ReactNode;
	/** Called with the resolved wake time (epoch ms) for the chosen preset. */
	onPick: (until: number) => void;
}

/**
 * The snooze preset popover ("Через час / Сегодня вечером / Завтра / Через
 * неделю"). Shared by the row hover-action and the reader kebab so both compute
 * wake times from the single {@link SNOOZE_PRESETS} table.
 */
export function SnoozePopover({
	open,
	onOpenChange,
	children,
	onPick,
}: SnoozePopoverProps) {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent align="end" className={cn(GLASS_PANEL, "w-48 p-1.5")}>
				<p className="px-2 py-1 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
					Отложить до
				</p>
				{SNOOZE_PRESETS.map((preset) => (
					<button
						key={preset.id}
						type="button"
						onClick={() => {
							onPick(preset.resolve(Date.now()));
							onOpenChange?.(false);
						}}
						className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
					>
						{preset.label}
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}
