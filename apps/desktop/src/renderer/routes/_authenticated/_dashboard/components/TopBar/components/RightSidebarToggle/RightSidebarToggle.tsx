import { MotionPressable } from "@rox/ui/motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import {
	LuPanelRight,
	LuPanelRightClose,
	LuPanelRightOpen,
} from "react-icons/lu";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { HotkeyLabel } from "renderer/hotkeys";

export function RightSidebarToggle() {
	const { preferences, setRightSidebarState } = useV2UserPreferences();
	// 3-state right files panel (F03 / #616). Plain click toggles the panel
	// between hidden and expanded (the familiar one-click open/close); ⌥/⇧ click
	// drops it into the narrow peek snap so all three states are reachable from
	// the toggle without a second control.
	const isOpen = preferences.rightSidebarState !== "hidden";

	const toggle = (e: React.MouseEvent) => {
		if (e.altKey || e.shiftKey) {
			setRightSidebarState("peek");
			return;
		}
		setRightSidebarState(isOpen ? "hidden" : "expanded");
	};

	const getToggleIcon = (isHovering: boolean) => {
		if (!isOpen) {
			return isHovering ? (
				<LuPanelRightOpen className="size-4" strokeWidth={1.5} />
			) : (
				<LuPanelRight className="size-4" strokeWidth={1.5} />
			);
		}
		return isHovering ? (
			<LuPanelRightClose className="size-4" strokeWidth={1.5} />
		) : (
			<LuPanelRight className="size-4" strokeWidth={1.5} />
		);
	};

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<MotionPressable
					type="button"
					onClick={toggle}
					className="no-drag group flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
				>
					<span className="group-hover:hidden">{getToggleIcon(false)}</span>
					<span className="hidden group-hover:block">
						{getToggleIcon(true)}
					</span>
				</MotionPressable>
			</TooltipTrigger>
			<TooltipContent side="left">
				<HotkeyLabel label="Toggle sidebar" id="TOGGLE_SIDEBAR" />
			</TooltipContent>
		</Tooltip>
	);
}
