import type { TerminalPreset } from "@rox/local-db";
import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import {
	motionDuration,
	motionSpring,
	Pressable,
	useShouldAnimate,
} from "@rox/ui/motion";
import { motion } from "framer-motion";
import { useState } from "react";
import { BsTerminalPlus } from "react-icons/bs";
import { HiMiniChevronDown } from "react-icons/hi2";
import { LuPlus } from "react-icons/lu";
import { TbMessageCirclePlus, TbWorld } from "react-icons/tb";
import { HotkeyMenuShortcut } from "renderer/components/HotkeyMenuShortcut";
import { NewTabDropZone } from "../../NewTabDropZone";
import { PresetsSubmenu } from "./components/PresetsSubmenu";

interface AddTabButtonProps {
	useCompactAddButton: boolean;
	showPresetsBar: boolean;
	presets: TerminalPreset[];
	onDropToNewTab: (paneId: string) => void;
	isLastPaneInTab: (paneId: string) => boolean;
	onAddTerminal: () => void;
	onAddChat: () => void;
	onAddBrowser: () => void;
	onOpenPreset: (preset: TerminalPreset) => void;
	onConfigurePresets: () => void;
	onToggleShowPresetsBar: (enabled: boolean) => void;
	onToggleCompactAddButton: (enabled: boolean) => void;
}

export function AddTabButton({
	useCompactAddButton,
	showPresetsBar,
	presets,
	onDropToNewTab,
	isLastPaneInTab,
	onAddTerminal,
	onAddChat,
	onAddBrowser,
	onOpenPreset,
	onConfigurePresets,
	onToggleShowPresetsBar,
	onToggleCompactAddButton,
}: AddTabButtonProps) {
	const showBigAddButton = !useCompactAddButton;
	const showPresetsInDropdown = !showPresetsBar;
	const [open, setOpen] = useState(false);
	const animate = useShouldAnimate("decorative");

	return (
		<NewTabDropZone onDrop={onDropToNewTab} isLastPaneInTab={isLastPaneInTab}>
			<DropdownMenu open={open} onOpenChange={setOpen}>
				<div className="flex items-center shrink-0">
					{showBigAddButton ? (
						<>
							<Button
								variant="ghost"
								className="h-7 rounded-r-none pl-2 pr-1.5 gap-1 text-xs border border-border/60 bg-muted/30 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
								onClick={onAddTerminal}
							>
								<BsTerminalPlus className="size-3.5" />
								Terminal
							</Button>
							<Button
								variant="ghost"
								className="h-7 rounded-none border border-l-0 border-border/60 bg-muted/30 px-1.5 gap-1 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
								onClick={onAddChat}
							>
								<TbMessageCirclePlus className="size-3.5" />
								Chat
							</Button>
							<Button
								variant="ghost"
								className="h-7 rounded-none border border-l-0 border-border/60 bg-muted/30 px-1.5 gap-1 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
								onClick={onAddBrowser}
							>
								<TbWorld className="size-3.5" />
								Browser
							</Button>
							<DropdownMenuTrigger asChild>
								<Button
									asChild
									variant="ghost"
									size="icon"
									className="size-7 rounded-l-none border border-l-0 border-border/60 bg-muted/30 px-1 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
								>
									<Pressable>
										<motion.span
											style={{ display: "inline-flex" }}
											animate={
												animate ? { rotate: open ? 180 : 0 } : { rotate: 0 }
											}
											transition={motionSpring.snappy}
										>
											<HiMiniChevronDown className="size-3" />
										</motion.span>
									</Pressable>
								</Button>
							</DropdownMenuTrigger>
						</>
					) : (
						<DropdownMenuTrigger asChild>
							<Button
								asChild
								variant="ghost"
								size="icon"
								className="size-7 px-1 rounded-md border border-border/60 bg-muted/30 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
							>
								<Pressable>
									<motion.span
										style={{ display: "inline-flex" }}
										animate={
											animate ? { rotate: open ? 90 : 0 } : { rotate: 0 }
										}
										transition={motionSpring.snappy}
									>
										<LuPlus className="size-3.5" strokeWidth={1.8} />
									</motion.span>
								</Pressable>
							</Button>
						</DropdownMenuTrigger>
					)}
				</div>
				<DropdownMenuContent align="end" className="w-56">
					<motion.div
						initial={animate ? { opacity: 0, scale: 0.96, y: -4 } : false}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						transition={{ duration: motionDuration.fast, ease: "easeOut" }}
						style={{ transformOrigin: "top right" }}
					>
						{!showBigAddButton && (
							<>
								<DropdownMenuItem onClick={onAddTerminal} className="gap-2">
									<BsTerminalPlus className="size-4" />
									<span>Терминал</span>
									<HotkeyMenuShortcut hotkeyId="NEW_GROUP" />
								</DropdownMenuItem>
								<DropdownMenuItem onClick={onAddChat} className="gap-2">
									<TbMessageCirclePlus className="size-4" />
									<span>Чат</span>
									<HotkeyMenuShortcut hotkeyId="NEW_CHAT" />
								</DropdownMenuItem>
								<DropdownMenuItem onClick={onAddBrowser} className="gap-2">
									<TbWorld className="size-4" />
									<span>Браузер</span>
									<HotkeyMenuShortcut hotkeyId="NEW_BROWSER" />
								</DropdownMenuItem>
								<DropdownMenuSeparator />
							</>
						)}
						{showPresetsInDropdown && (
							<>
								<PresetsSubmenu
									presets={presets}
									onOpenPreset={onOpenPreset}
									onConfigurePresets={onConfigurePresets}
								/>
								<DropdownMenuSeparator />
							</>
						)}
						<DropdownMenuCheckboxItem
							checked={showPresetsBar}
							onCheckedChange={onToggleShowPresetsBar}
							onSelect={(e) => e.preventDefault()}
						>
							Show Preset Bar
						</DropdownMenuCheckboxItem>
						<DropdownMenuCheckboxItem
							checked={useCompactAddButton}
							onCheckedChange={(checked) =>
								onToggleCompactAddButton(checked === true)
							}
							onSelect={(e) => e.preventDefault()}
						>
							Use Compact Button
						</DropdownMenuCheckboxItem>
					</motion.div>
				</DropdownMenuContent>
			</DropdownMenu>
		</NewTabDropZone>
	);
}
