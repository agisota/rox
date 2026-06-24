import { describe, expect, it, mock } from "bun:test";

// `executeCommand` imports `toast` from "@rox/ui/sonner" at module load, and the
// disabled-command branch calls `toast.info(...)`. The real sonner toast is not
// wired in the Bun test environment, so we provide a faithful, callable stub
// BEFORE importing `executeCommand`. The stub exposes the same methods
// `execute.ts` uses (`info`, `error`) so it stays compatible even if Bun's
// single-VM module registry shares this mock with other desktop tests.
const toastInfoSpy = mock();
const toastErrorSpy = mock();
mock.module("@rox/ui/sonner", () => ({
	toast: { info: toastInfoSpy, error: toastErrorSpy },
}));

const { executeCommand } = await import("../../core/execute");
const {
	AGENT_NATIVE_BACKED_COMMAND_IDS,
	AGENT_NATIVE_DISABLED_COMMAND_IDS,
	AGENT_SOURCES_ROUTE_PATH,
	agentNativeProvider,
} = await import("./commands");
type CommandContext = import("../../core/types").CommandContext;

function createContext(
	overrides: Partial<CommandContext> = {},
): CommandContext {
	return {
		route: { pathname: "/v2-workspace/workspace-1", params: {} },
		workspace: null,
		activeHostUrl: null,
		activeOrganizationId: null,
		activeOrganizationName: null,
		hostServiceStatus: "running",
		localMachineId: null,
		notificationSoundsMuted: false,
		navigate: mock(),
		experimentalAgentCommandPalette: true,
		experimentalAgentSourceMarketplace: false,
		...overrides,
	};
}

describe("agentNativeProvider", () => {
	it("contributes no commands when the experimental gate is disabled", () => {
		const commands = agentNativeProvider.provide(
			createContext({ experimentalAgentCommandPalette: false }),
		);
		expect(commands).toEqual([]);
	});

	it("contributes no commands when the gate flag is absent (defaults off)", () => {
		const commands = agentNativeProvider.provide(
			createContext({ experimentalAgentCommandPalette: undefined }),
		);
		expect(commands).toEqual([]);
	});

	it("contributes the agent-native suite when the gate is enabled", () => {
		const commands = agentNativeProvider.provide(createContext());
		const ids = commands.map((command) => command.id);

		for (const backedId of AGENT_NATIVE_BACKED_COMMAND_IDS) {
			expect(ids).toContain(backedId);
		}
		for (const disabledId of AGENT_NATIVE_DISABLED_COMMAND_IDS) {
			expect(ids).toContain(disabledId);
		}
		// The conditionally-backed source action is always contributed (its
		// enabled/disabled state depends on the sourceMarketplace gate).
		expect(ids).toContain("agentNative.attachSource");
		// Every contributed command is namespaced under the suite.
		for (const id of ids) {
			expect(id.startsWith("agentNative.")).toBe(true);
		}
		// Every contributed command lands in a real palette section.
		for (const command of commands) {
			expect(["workspace", "actions", "navigation"]).toContain(command.section);
		}
	});

	it("navigates backed commands to a real shipped surface via executeCommand", async () => {
		const navigate = mock();
		const context = createContext({ navigate });
		const commands = agentNativeProvider.provide(context);

		for (const backedId of AGENT_NATIVE_BACKED_COMMAND_IDS) {
			const command = commands.find((entry) => entry.id === backedId);
			expect(command).toBeDefined();
			expect(command?.disabled).toBeFalsy();
			expect(typeof command?.run).toBe("function");
		}

		const reviewPermissions = commands.find(
			(entry) => entry.id === "agentNative.reviewPermissions",
		);
		await executeCommand(
			reviewPermissions as NonNullable<typeof reviewPermissions>,
			context,
		);
		expect(navigate).toHaveBeenCalledWith("/settings/agents");

		const replayRun = commands.find(
			(entry) => entry.id === "agentNative.replayRun",
		);
		await executeCommand(replayRun as NonNullable<typeof replayRun>, context);
		expect(navigate).toHaveBeenCalledWith("/automations");
	});

	it("marks not-yet-backed actions disabled with a clear disabledReason and never fakes a run", async () => {
		toastInfoSpy.mockClear();
		const navigate = mock();
		const context = createContext({ navigate });
		const commands = agentNativeProvider.provide(context);

		for (const disabledId of AGENT_NATIVE_DISABLED_COMMAND_IDS) {
			const command = commands.find((entry) => entry.id === disabledId);
			expect(command).toBeDefined();
			expect(command?.disabled).toBe(true);
			expect(command?.disabledReason).toBeTruthy();
			expect((command?.disabledReason ?? "").length).toBeGreaterThan(0);

			// Routing a disabled command through executeCommand must short-circuit:
			// it surfaces the disabledReason (toast.info) and never runs/navigates,
			// because the action is honestly not wired yet.
			await executeCommand(command as NonNullable<typeof command>, context);
			expect(toastInfoSpy).toHaveBeenCalledWith(command?.disabledReason);
		}
		expect(navigate).not.toHaveBeenCalled();
	});

	describe("agentNative.attachSource (sourceMarketplace gate)", () => {
		it("is DISABLED (honest, no fake run) when the sources feature is OFF", async () => {
			toastInfoSpy.mockClear();
			const navigate = mock();
			const context = createContext({
				navigate,
				experimentalAgentSourceMarketplace: false,
			});
			const commands = agentNativeProvider.provide(context);

			const attach = commands.find(
				(entry) => entry.id === "agentNative.attachSource",
			);
			expect(attach).toBeDefined();
			expect(attach?.disabled).toBe(true);
			expect((attach?.disabledReason ?? "").length).toBeGreaterThan(0);
			expect(attach?.run).toBeUndefined();

			// Executing it surfaces the reason and does NOT navigate.
			await executeCommand(attach as NonNullable<typeof attach>, context);
			expect(toastInfoSpy).toHaveBeenCalledWith(attach?.disabledReason);
			expect(navigate).not.toHaveBeenCalled();
		});

		it("defaults to DISABLED when the sources gate flag is absent", () => {
			const context = createContext({
				experimentalAgentSourceMarketplace: undefined,
			});
			const commands = agentNativeProvider.provide(context);
			const attach = commands.find(
				(entry) => entry.id === "agentNative.attachSource",
			);
			expect(attach?.disabled).toBe(true);
			expect(attach?.run).toBeUndefined();
		});

		it("NAVIGATES to the in-desktop sources route when the sources feature is ON", async () => {
			const navigate = mock();
			const context = createContext({
				navigate,
				experimentalAgentSourceMarketplace: true,
			});
			const commands = agentNativeProvider.provide(context);

			const attach = commands.find(
				(entry) => entry.id === "agentNative.attachSource",
			);
			expect(attach).toBeDefined();
			expect(attach?.disabled).toBeFalsy();
			expect(typeof attach?.run).toBe("function");

			await executeCommand(attach as NonNullable<typeof attach>, context);
			expect(navigate).toHaveBeenCalledWith(AGENT_SOURCES_ROUTE_PATH);
			expect(AGENT_SOURCES_ROUTE_PATH).toBe("/settings/agents/sources");
		});
	});
});
