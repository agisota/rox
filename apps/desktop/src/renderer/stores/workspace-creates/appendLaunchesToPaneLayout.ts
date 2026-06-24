import { createWorkspaceStore, type WorkspaceState } from "@rox/panes";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

const EMPTY_STATE: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

type AgentLaunchResult =
	| { ok: true; kind: "terminal"; sessionId: string; label: string }
	| { ok: true; kind: "chat"; sessionId: string; label: string }
	| { ok: false; error: string };

interface AppendArgs {
	existing: WorkspaceState<PaneViewerData> | undefined;
	terminals: Array<{ terminalId: string; label?: string }>;
	agents: AgentLaunchResult[];
}

interface PaneLaunch {
	kind: "terminal" | "chat";
	sessionId: string;
	label?: string;
}

export function appendLaunchesToPaneLayout({
	existing,
	terminals,
	agents,
}: AppendArgs): WorkspaceState<PaneViewerData> {
	const terminalLaunches: PaneLaunch[] = terminals.map((entry) => ({
		kind: "terminal",
		sessionId: entry.terminalId,
		label: entry.label,
	}));
	const agentLaunches: PaneLaunch[] = agents
		.filter((entry): entry is Extract<typeof entry, { ok: true }> => entry.ok)
		.map((entry) => ({
			kind: entry.kind,
			sessionId: entry.sessionId,
			label: entry.label,
		}));
	const launches = [...terminalLaunches, ...agentLaunches];

	if (launches.length === 0) {
		return existing ?? EMPTY_STATE;
	}

	const store = createWorkspaceStore<PaneViewerData>({
		initialState: existing ?? EMPTY_STATE,
	});

	for (const launch of launches) {
		store.getState().addTab({
			titleOverride: launch.label,
			panes: [
				launch.kind === "chat"
					? {
							kind: "chat",
							data: { sessionId: launch.sessionId } satisfies ChatPaneData,
						}
					: {
							kind: "terminal",
							data: {
								terminalId: launch.sessionId,
							} satisfies TerminalPaneData,
						},
			],
		});
	}

	// Chat-first default: the surface the user lands on after a workspace is
	// created must be a chat, never the setup terminal that runs rox.setup.sh.
	// Folding the launches above can leave a terminal tab as the active tab (the
	// last `addTab` wins), so when the resulting active tab is not already a chat
	// tab we add one last — `addTab` activates it — leaving every launched
	// terminal/agent running in the background as its own tab.
	if (!isActiveTabChat(store.getState())) {
		store.getState().addTab({
			panes: [
				{ kind: "chat", data: { sessionId: null } satisfies ChatPaneData },
			],
		});
	}

	const next = store.getState();
	return {
		version: next.version,
		tabs: next.tabs,
		activeTabId: next.activeTabId,
	};
}

/** Whether the active tab's active pane is a chat pane. */
function isActiveTabChat(state: WorkspaceState<PaneViewerData>): boolean {
	const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
	if (!activeTab) return false;
	const activePaneId = activeTab.activePaneId;
	const activePane = activePaneId ? activeTab.panes[activePaneId] : undefined;
	return activePane?.kind === "chat";
}
