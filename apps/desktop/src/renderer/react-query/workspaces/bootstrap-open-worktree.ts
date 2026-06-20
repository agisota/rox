import { logger } from "renderer/lib/logger";
import {
	buildTerminalCommand,
	ensureTerminalAttached,
	writeCommandInPane,
} from "renderer/lib/terminal/launch-command";

interface OpenWorkspaceData {
	workspace: { id: string };
	initialCommands?: string[] | null;
}

export type BootstrapOpenWorktreeError =
	| "create_or_attach_failed"
	| "write_initial_commands_failed";

interface BootstrapOpenWorktreeOptions {
	data: OpenWorkspaceData;
	/** Creates the chat tab that the user lands on (primary surface). */
	addChatTab: (workspaceId: string) => { tabId: string; paneId: string };
	/** Creates a terminal tab/pane used only to run the setup command. */
	addTab: (workspaceId: string) => { tabId: string; paneId: string };
	setTabAutoTitle: (tabId: string, title: string) => void;
	createOrAttach: (input: {
		paneId: string;
		tabId: string;
		workspaceId: string;
		joinPending?: boolean;
	}) => Promise<unknown>;
	writeToTerminal: (input: {
		paneId: string;
		data: string;
		throwOnError?: boolean;
	}) => Promise<unknown>;
}

export async function bootstrapOpenWorktree(
	options: BootstrapOpenWorktreeOptions,
): Promise<BootstrapOpenWorktreeError | null> {
	const workspaceId = options.data.workspace.id;
	const setupCommand = buildTerminalCommand(options.data.initialCommands);

	// No setup command: chat is the only surface. Create the chat tab and stop —
	// a chat pane cannot run shell commands, so there is nothing to attach.
	if (!setupCommand) {
		options.addChatTab(workspaceId);
		return null;
	}

	// Setup command path: create the terminal tab first (it runs the command),
	// then create the chat tab last so it becomes the active/visible tab. The
	// setup command still runs in the real terminal pane in the background.
	const { tabId: terminalTabId, paneId: terminalPaneId } =
		options.addTab(workspaceId);
	options.setTabAutoTitle(terminalTabId, "Workspace Setup");
	options.addChatTab(workspaceId);

	try {
		await ensureTerminalAttached({
			paneId: terminalPaneId,
			tabId: terminalTabId,
			workspaceId,
			createOrAttach: options.createOrAttach,
		});
	} catch (error) {
		logger.error("[bootstrapOpenWorktree] Failed to create or attach:", error);
		return "create_or_attach_failed";
	}

	try {
		await writeCommandInPane({
			paneId: terminalPaneId,
			command: setupCommand,
			write: options.writeToTerminal,
		});
		return null;
	} catch (error) {
		logger.error(
			"[bootstrapOpenWorktree] Failed to write initial commands:",
			error,
		);
		return "write_initial_commands_failed";
	}
}
