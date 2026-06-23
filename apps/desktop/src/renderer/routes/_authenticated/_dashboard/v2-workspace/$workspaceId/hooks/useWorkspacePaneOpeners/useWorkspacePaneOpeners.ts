import type { WorkspaceStore } from "@rox/panes";
import { useCallback } from "react";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import type { StoreApi } from "zustand/vanilla";
import type {
	BrowserPaneData,
	ChatPaneData,
	CommentPaneData,
	DiffFocusSide,
	DiffPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../types";
import type { TerminalLauncher } from "../useV2TerminalLauncher";

/**
 * Builds the data payload for a fresh chat pane. A `launchConfig` (carrying an
 * initial prompt + attachments, e.g. the chat-driven Create PR flow) is only
 * attached when it's a real config object. React `onClick` handlers wire
 * `addChatTab` directly (`onClick={onAddChat}`), so the first argument can be a
 * `MouseEvent` rather than a config — in that case we fall back to a blank pane.
 */
export function buildChatPaneData(
	launchConfig?: ChatPaneData["launchConfig"],
): ChatPaneData {
	if (isChatLaunchConfig(launchConfig)) {
		return { sessionId: null, launchConfig };
	}
	return { sessionId: null };
}

function isChatLaunchConfig(
	value: unknown,
): value is NonNullable<ChatPaneData["launchConfig"]> {
	if (value == null || typeof value !== "object") return false;
	// Reject React synthetic events / DOM events that leak in via onClick.
	if ("nativeEvent" in value || "preventDefault" in value) return false;
	const config = value as Record<string, unknown>;
	return (
		"initialPrompt" in config ||
		"initialFiles" in config ||
		"model" in config ||
		"taskSlug" in config
	);
}

export function useWorkspacePaneOpeners({
	store,
	launcher,
	newTabPresets,
	executePreset,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	launcher: TerminalLauncher;
	newTabPresets: V2TerminalPresetRow[];
	executePreset: (
		preset: V2TerminalPresetRow,
		options?: { target?: "new-tab" | "active-tab" },
	) => void | Promise<void>;
}): {
	openDiffPane: (
		filePath: string,
		openInNewTab?: boolean,
		line?: number,
		side?: DiffFocusSide,
	) => void;
	addTerminalTab: () => Promise<void>;
	addChatTab: (launchConfig?: ChatPaneData["launchConfig"]) => void;
	addBrowserTab: () => void;
	openCommentPane: (comment: CommentPaneData) => void;
} {
	const openDiffPane = useCallback(
		(
			filePath: string,
			openInNewTab?: boolean,
			line?: number,
			side?: DiffFocusSide,
		) => {
			const state = store.getState();
			// Bump tick on every request so the scroll effect re-fires on repeat
			// clicks; clear when no line is given so reused panes don't jump
			// to a stale focus.
			const focusFields =
				line != null
					? { focusLine: line, focusSide: side, focusTick: Date.now() }
					: {
							focusLine: undefined,
							focusSide: undefined,
							focusTick: undefined,
						};
			if (openInNewTab) {
				state.addTab({
					panes: [
						{
							kind: "diff",
							data: {
								path: filePath,
								collapsedFiles: [],
								...focusFields,
							} as DiffPaneData,
						},
					],
				});
				return;
			}
			for (const tab of state.tabs) {
				for (const pane of Object.values(tab.panes)) {
					if (pane.kind !== "diff") continue;
					const prev = pane.data as DiffPaneData;
					state.setPaneData({
						paneId: pane.id,
						data: {
							...prev,
							path: filePath,
							collapsedFiles: (prev.collapsedFiles ?? []).filter(
								(p) => p !== filePath,
							),
							...focusFields,
						} as PaneViewerData,
					});
					state.setActiveTab(tab.id);
					state.setActivePane({ tabId: tab.id, paneId: pane.id });
					return;
				}
			}
			state.openPane({
				pane: {
					kind: "diff",
					data: {
						path: filePath,
						collapsedFiles: [],
						...focusFields,
					} as DiffPaneData,
				},
			});
		},
		[store],
	);

	const addBlankTerminalTab = useCallback(async () => {
		const terminalId = await launcher.create();
		store.getState().addTab({
			panes: [
				{
					kind: "terminal",
					data: { terminalId } as TerminalPaneData,
				},
			],
		});
	}, [store, launcher]);

	const addTerminalTab = useCallback(async () => {
		if (newTabPresets.length === 0) {
			await addBlankTerminalTab();
			return;
		}

		// New terminal tabs are the trigger point for applyOnNewTab presets.
		// Each matching preset owns the tab/pane shape it creates.
		for (const preset of newTabPresets) {
			await executePreset(preset, { target: "new-tab" });
		}
	}, [addBlankTerminalTab, executePreset, newTabPresets]);

	const addChatTab = useCallback(
		(launchConfig?: ChatPaneData["launchConfig"]) => {
			store.getState().addTab({
				panes: [
					{
						kind: "chat",
						data: buildChatPaneData(launchConfig) as PaneViewerData,
					},
				],
			});
		},
		[store],
	);

	const addBrowserTab = useCallback(() => {
		store.getState().addTab({
			panes: [
				{
					kind: "browser",
					data: {
						url: "about:blank",
					} as BrowserPaneData,
				},
			],
		});
	}, [store]);

	const openCommentPane = useCallback(
		(comment: CommentPaneData) => {
			const state = store.getState();
			for (const tab of state.tabs) {
				for (const pane of Object.values(tab.panes)) {
					if (pane.kind !== "comment") continue;
					state.setPaneData({
						paneId: pane.id,
						data: comment as PaneViewerData,
					});
					state.setActiveTab(tab.id);
					state.setActivePane({ tabId: tab.id, paneId: pane.id });
					return;
				}
			}
			state.addTab({
				panes: [
					{
						kind: "comment",
						data: comment as PaneViewerData,
					},
				],
			});
		},
		[store],
	);

	return {
		openDiffPane,
		addTerminalTab,
		addChatTab,
		addBrowserTab,
		openCommentPane,
	};
}
