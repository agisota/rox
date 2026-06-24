import type { PaneActionConfig } from "@rox/panes";
import { useMemo } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { TbLayoutColumns, TbLayoutRows } from "react-icons/tb";
import { HotkeyLabel } from "renderer/hotkeys";
import type { ChatPaneData, PaneViewerData } from "../../types";
import type { TerminalLauncher } from "../useV2TerminalLauncher";

export function useDefaultPaneActions(_props: {
	launcher: TerminalLauncher;
}): PaneActionConfig<PaneViewerData>[] {
	return useMemo<PaneActionConfig<PaneViewerData>[]>(
		() => [
			{
				key: "split",
				icon: (ctx) =>
					ctx.pane.parentDirection === "horizontal" ? (
						<TbLayoutRows className="size-3.5" />
					) : (
						<TbLayoutColumns className="size-3.5" />
					),
				// Default split opens a Chat pane (Cmd+E). Terminal split lives on
				// SPLIT_AUTO (Cmd+Shift+E) and the explicit context-menu actions.
				tooltip: <HotkeyLabel label="Split pane" id="SPLIT_WITH_CHAT" />,
				onClick: (ctx) => {
					const position =
						ctx.pane.parentDirection === "horizontal" ? "down" : "right";
					ctx.actions.split(position, {
						kind: "chat",
						data: { sessionId: null } as ChatPaneData,
					});
				},
			},
			{
				key: "close",
				icon: <HiMiniXMark className="size-3.5" />,
				tooltip: <HotkeyLabel label="Close pane" id="CLOSE_PANE" />,
				onClick: (ctx) => ctx.actions.close(),
			},
		],
		[],
	);
}
