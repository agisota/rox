import type { HostAgentConfig } from "@rox/host-service/settings";
import { Button } from "@rox/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@rox/ui/context-menu";
import { ease, motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniCommandLine } from "react-icons/hi2";
import type { HotkeyId } from "renderer/hotkeys";
import { HotkeyLabel } from "renderer/hotkeys";
import { resolveV2PresetIcon } from "renderer/lib/preset-icon";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

const V2_PRESET_BAR_ITEM_TYPE = "V2_PRESET_BAR_ITEM";

interface V2PresetBarItemProps {
	preset: V2TerminalPresetRow;
	visibleIndex: number;
	hotkeyId?: HotkeyId;
	isDark: boolean;
	agents: HostAgentConfig[] | undefined;
	onExecutePreset: (preset: V2TerminalPresetRow) => void;
	onEdit: (preset: V2TerminalPresetRow) => void;
	onLocalReorder: (fromIndex: number, toIndex: number) => void;
	onPersistReorder: (presetId: string, targetVisibleIndex: number) => void;
}

export function V2PresetBarItem({
	preset,
	visibleIndex,
	hotkeyId,
	isDark,
	agents,
	onExecutePreset,
	onEdit,
	onLocalReorder,
	onPersistReorder,
}: V2PresetBarItemProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [glow, setGlow] = useState(false);
	const shouldAnimate = useShouldAnimate("decorative");
	const icon = resolveV2PresetIcon(preset, agents, isDark);
	const label = preset.description || preset.name || "default";

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: V2_PRESET_BAR_ITEM_TYPE,
			item: {
				id: preset.id,
				index: visibleIndex,
				originalIndex: visibleIndex,
			},
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[preset.id, visibleIndex],
	);

	const [, drop] = useDrop({
		accept: V2_PRESET_BAR_ITEM_TYPE,
		hover: (item: { id: string; index: number; originalIndex: number }) => {
			if (item.index !== visibleIndex) {
				onLocalReorder(item.index, visibleIndex);
				item.index = visibleIndex;
			}
		},
		drop: (item: { id: string; index: number; originalIndex: number }) => {
			if (item.originalIndex !== item.index) {
				onPersistReorder(item.id, item.index);
			}
		},
	});

	useEffect(() => {
		drag(drop(containerRef));
	}, [drag, drop]);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<motion.div
					ref={containerRef}
					layout={shouldAnimate ? "position" : false}
					initial={shouldAnimate ? { opacity: 0, scale: 0.9 } : false}
					animate={{ opacity: isDragging ? 0.4 : 1, scale: 1 }}
					exit={shouldAnimate ? { opacity: 0, scale: 0.9 } : undefined}
					transition={{
						duration: motionDuration.fast,
						ease: [...ease.standard],
					}}
					style={{
						cursor: isDragging ? "grabbing" : "grab",
						position: "relative",
					}}
				>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 max-w-32 min-w-0 shrink-0 gap-1.5 rounded-md px-1.5 text-xs font-normal text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
								onClick={() => {
									onExecutePreset(preset);
									if (shouldAnimate) setGlow(true);
								}}
							>
								{icon ? (
									<img
										src={icon}
										alt=""
										className="size-3.5 shrink-0 object-contain opacity-90"
									/>
								) : (
									<HiMiniCommandLine className="size-3.5 shrink-0" />
								)}
								<span className="min-w-0 truncate">
									{preset.name || "default"}
								</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom" sideOffset={4}>
							<HotkeyLabel label={label} id={hotkeyId} />
						</TooltipContent>
					</Tooltip>
					{shouldAnimate && glow ? (
						<motion.span
							aria-hidden
							className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-primary/60"
							initial={{ opacity: 0.9, boxShadow: "0 0 0 0 var(--primary)" }}
							animate={{ opacity: 0, boxShadow: "0 0 12px 2px var(--primary)" }}
							transition={{
								duration: motionDuration.base,
								ease: [...ease.standard],
							}}
							onAnimationComplete={() => setGlow(false)}
						/>
					) : null}
				</motion.div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={() => onExecutePreset(preset)}>
					Run preset
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={() => onEdit(preset)}>
					Edit preset
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
