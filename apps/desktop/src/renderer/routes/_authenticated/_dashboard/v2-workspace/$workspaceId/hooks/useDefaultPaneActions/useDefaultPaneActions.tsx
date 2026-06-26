import type { PaneActionConfig, WorkspaceState } from "@rox/panes";
import { useMemo } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { LuExternalLink } from "react-icons/lu";
import { TbLayoutColumns, TbLayoutRows } from "react-icons/tb";
import { HotkeyLabel } from "renderer/hotkeys";
import { logger } from "renderer/lib/logger";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { ChatPaneData, PaneViewerData } from "../../types";
import { toPopoutPaneKind } from "../../utils/popoutPaneKind/popoutPaneKind";
import type { TerminalLauncher } from "../useV2TerminalLauncher";

export function useDefaultPaneActions(props: {
	launcher: TerminalLauncher;
	/** Workspace these panes belong to — needed to key the tear-off window. */
	workspaceId: string;
}): PaneActionConfig<PaneViewerData>[] {
	const { workspaceId } = props;
	return useMemo<PaneActionConfig<PaneViewerData>[]>(
		() => [
			{
				key: "popout",
				icon: <LuExternalLink className="size-3.5" />,
				tooltip: "Pop out into its own window",
				onClick: (ctx) => {
					// Tear this pane off into its own desktop window (F52). The popout
					// is a view onto the one core-state: we hand it the live serialized
					// `@rox/panes` layout so it rehydrates the same pane, then stays in
					// sync through the shared Electric/collections + tRPC core.
					const kind = toPopoutPaneKind(ctx.pane.kind);
					if (!kind) return;
					const s = ctx.store.getState();
					const layout: WorkspaceState<PaneViewerData> = {
						version: s.version,
						tabs: s.tabs,
						activeTabId: s.activeTabId,
					};
					void electronTrpcClient.popout.openPane
						.mutate({
							workspaceId,
							paneId: ctx.pane.id,
							kind,
							paneLayoutJson: JSON.stringify(layout),
						})
						.catch((error) => {
							logger.error("[popout] Failed to open pane window:", error);
						});
				},
			},
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
		[workspaceId],
	);
}
