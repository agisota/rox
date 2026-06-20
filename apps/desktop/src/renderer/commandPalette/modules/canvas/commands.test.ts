import { describe, expect, it, mock } from "bun:test";
import type { CommandContext } from "../../core/types";
import {
	canvasCommandsProvider,
	registerCanvasCommandHandlers,
	resetCanvasCommandHandlersForTest,
} from "./commands";

function createContext(pathname: string): CommandContext {
	return {
		route: {
			pathname,
			params: {},
		},
		workspace: null,
		activeHostUrl: null,
		activeOrganizationId: null,
		activeOrganizationName: null,
		hostServiceStatus: "running",
		localMachineId: null,
		notificationSoundsMuted: false,
		navigate: mock(),
	};
}

describe("canvasCommandsProvider", () => {
	it("does not expose Canvas commands outside the Canvas route", () => {
		resetCanvasCommandHandlersForTest();
		registerCanvasCommandHandlers({
			"canvas.addTextNode": {
				run: mock(),
			},
		});

		const commands = canvasCommandsProvider.provide(
			createContext("/v2-workspace/workspace-1"),
		);

		expect(commands).toEqual([]);
	});

	it("exposes active Canvas handlers through the canonical command palette", () => {
		resetCanvasCommandHandlersForTest();
		const run = mock();
		registerCanvasCommandHandlers({
			"canvas.addTextNode": {
				run,
			},
			"canvas.undo": {
				run: mock(),
				disabled: true,
				disabledReason: "No Canvas mutations to undo",
			},
		});

		const commands = canvasCommandsProvider.provide(
			createContext("/canvas/workspace-1"),
		);

		expect(commands.map((command) => command.id)).toContain(
			"canvas.addTextNode",
		);
		expect(commands.map((command) => command.id)).toContain("canvas.undo");
		expect(
			commands.find((command) => command.id === "canvas.undo"),
		).toMatchObject({
			disabled: true,
			disabledReason: "No Canvas mutations to undo",
		});

		commands
			.find((command) => command.id === "canvas.addTextNode")
			?.run?.(createContext("/canvas/workspace-1"));
		expect(run).toHaveBeenCalledTimes(1);
	});
});
