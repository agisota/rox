import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { bootstrapOpenWorktree } from "./bootstrap-open-worktree";

describe("bootstrapOpenWorktree", () => {
	const originalConsoleError = console.error;

	beforeEach(() => {
		console.error = mock(() => undefined);
	});

	afterEach(() => {
		console.error = originalConsoleError;
	});

	it("returns create_or_attach_failed when createOrAttach fails", async () => {
		const writeToTerminal = mock(async () => ({}));

		const error = await bootstrapOpenWorktree({
			data: {
				workspace: { id: "ws-1" },
				initialCommands: ["echo setup"],
			},
			addChatTab: () => ({ tabId: "chat-1", paneId: "chat-pane-1" }),
			addTab: () => ({ tabId: "term-1", paneId: "term-pane-1" }),
			setTabAutoTitle: mock(() => {}),
			createOrAttach: async () => {
				throw new Error("attach failed");
			},
			writeToTerminal,
		});

		expect(error).toBe("create_or_attach_failed");
		expect(writeToTerminal).not.toHaveBeenCalled();
	});

	it("returns write_initial_commands_failed when write fails", async () => {
		const error = await bootstrapOpenWorktree({
			data: {
				workspace: { id: "ws-1" },
				initialCommands: ["echo setup"],
			},
			addChatTab: () => ({ tabId: "chat-1", paneId: "chat-pane-1" }),
			addTab: () => ({ tabId: "term-1", paneId: "term-pane-1" }),
			setTabAutoTitle: mock(() => {}),
			createOrAttach: async () => ({}),
			writeToTerminal: async () => {
				throw new Error("write failed");
			},
		});

		expect(error).toBe("write_initial_commands_failed");
	});

	it("with a setup command: creates chat tab as active AND a terminal pane for setup", async () => {
		const createOrAttach = mock(async () => ({}));
		const writeToTerminal = mock(async () => ({}));
		const addChatTab = mock(() => ({
			tabId: "chat-1",
			paneId: "chat-pane-1",
		}));
		const addTab = mock(() => ({ tabId: "term-1", paneId: "term-pane-1" }));
		const setTabAutoTitle = mock(() => {});

		const error = await bootstrapOpenWorktree({
			data: {
				workspace: { id: "ws-1" },
				initialCommands: ["echo setup"],
			},
			addChatTab,
			addTab,
			setTabAutoTitle,
			createOrAttach,
			writeToTerminal,
		});

		expect(error).toBeNull();
		// Both tabs created; chat tab created last so it is the active/visible one.
		expect(addTab).toHaveBeenCalledWith("ws-1");
		expect(addChatTab).toHaveBeenCalledWith("ws-1");
		expect(setTabAutoTitle).toHaveBeenCalledWith("term-1", "Workspace Setup");
		// Setup runs against the real terminal pane, not the chat pane.
		expect(createOrAttach).toHaveBeenCalledWith({
			paneId: "term-pane-1",
			tabId: "term-1",
			workspaceId: "ws-1",
			joinPending: true,
		});
		expect(writeToTerminal).toHaveBeenCalledWith({
			paneId: "term-pane-1",
			data: "echo setup\n",
			throwOnError: true,
		});
	});

	it("with no setup command: creates only a chat tab and never attaches a terminal", async () => {
		const createOrAttach = mock(async () => ({}));
		const writeToTerminal = mock(async () => ({}));
		const addChatTab = mock(() => ({
			tabId: "chat-1",
			paneId: "chat-pane-1",
		}));
		const addTab = mock(() => ({ tabId: "term-1", paneId: "term-pane-1" }));

		const error = await bootstrapOpenWorktree({
			data: {
				workspace: { id: "ws-1" },
				initialCommands: null,
			},
			addChatTab,
			addTab,
			setTabAutoTitle: mock(() => {}),
			createOrAttach,
			writeToTerminal,
		});

		expect(error).toBeNull();
		// Default surface is chat.
		expect(addChatTab).toHaveBeenCalledWith("ws-1");
		// No terminal tab, no attach, no write when there is no setup command.
		expect(addTab).not.toHaveBeenCalled();
		expect(createOrAttach).not.toHaveBeenCalled();
		expect(writeToTerminal).not.toHaveBeenCalled();
	});
});
