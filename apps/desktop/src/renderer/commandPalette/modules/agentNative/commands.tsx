import {
	GitBranchIcon,
	HistoryIcon,
	ShieldCheckIcon,
	UsersIcon,
} from "lucide-react";
import { AGENT_SOURCES_ROUTE_PATH } from "renderer/routes/_authenticated/settings/agents/sources/route-path";
import type { Command, CommandProvider } from "../../core/types";

/**
 * Agent-Native command palette entries (`agentNative.commandPalette`).
 *
 * This provider contributes discoverable palette commands for the Agent-Native
 * suite. It is gated on the `agentNative.commandPalette` experimental feature:
 * the gate state is carried on `CommandContext.experimentalAgentCommandPalette`
 * (resolved once in `CommandContextProvider` via `useExperimentalFeature`,
 * because `provide` runs outside a React render and cannot call the hook).
 * When the gate is off (or absent), the provider contributes nothing.
 *
 * HONESTY CONTRACT (experimental anti-slop rule): a command only gets a real
 * `run` when it navigates to a surface that actually ships in the desktop app
 * today. Actions whose backing surface is not yet built are contributed as
 * DISABLED with a clear `disabledReason` instead of a faked navigation, so the
 * palette stays discoverable without lying about what works:
 *
 *   - "Review agent permissions" -> /settings/agents  (REAL: the Agents
 *     settings surface where per-agent tools/permissions are managed).
 *   - "Replay run"               -> /automations       (REAL: the automation
 *     run-history surface, the shipped surface closest to run replay).
 *   - "Attach agent source"      -> /settings/agents/sources WHEN the
 *     `agentNative.sourceMarketplace` feature is enabled (the in-desktop sources
 *     management surface, parity of the web `(agents)` surface). When that
 *     feature is OFF/unavailable the command stays DISABLED — the surface is
 *     gated off, so navigating there would only hit the inert fallback.
 *   - "Delegate to agent"        -> DISABLED: agent-to-agent delegation
 *     (`agentNative.a2aDelegation`) is still `planned` — no surface exists.
 */

/** Commands that navigate to a real, shipped desktop surface. */
export const AGENT_NATIVE_BACKED_COMMAND_IDS = [
	"agentNative.reviewPermissions",
	"agentNative.replayRun",
] as const;

/**
 * Commands whose backing surface is not yet built (disabled, not faked) — when
 * their feature is off. `agentNative.attachSource` is intentionally NOT listed
 * here: it is conditionally backed (real navigation) when
 * `agentNative.sourceMarketplace` is enabled, and disabled otherwise. See
 * {@link buildAgentNativeCommands}.
 */
export const AGENT_NATIVE_DISABLED_COMMAND_IDS = [
	"agentNative.delegate",
] as const;

/** Re-exported so callers/tests can navigate to / assert the sources route. */
export { AGENT_SOURCES_ROUTE_PATH };

interface BuildAgentNativeCommandsOptions {
	/**
	 * Whether `agentNative.sourceMarketplace` is usable (enabled AND available).
	 * Flips the "Подключить источник агента" command from disabled to a real
	 * navigation into the in-desktop sources route. Defaults to off.
	 */
	sourceMarketplaceEnabled?: boolean;
}

function buildAgentNativeCommands({
	sourceMarketplaceEnabled = false,
}: BuildAgentNativeCommandsOptions = {}): Command[] {
	// "Подключить источник агента": backed by the real in-desktop sources surface
	// only when its feature gate is on; otherwise stays honestly disabled.
	const attachSourceCommand: Command = sourceMarketplaceEnabled
		? {
				id: "agentNative.attachSource",
				title: "Подключить источник агента",
				section: "navigation",
				icon: GitBranchIcon,
				keywords: [
					"agent",
					"агент",
					"source",
					"источник",
					"подключить",
					"attach",
					"marketplace",
					"коннектор",
				],
				run: (ctx) => ctx.navigate(AGENT_SOURCES_ROUTE_PATH),
			}
		: {
				id: "agentNative.attachSource",
				title: "Подключить источник агента",
				section: "navigation",
				icon: GitBranchIcon,
				keywords: [
					"agent",
					"агент",
					"source",
					"источник",
					"подключить",
					"attach",
					"marketplace",
					"коннектор",
				],
				disabled: true,
				disabledReason:
					"Управление источниками агентов выключено. Включите экспериментальную функцию «Source Marketplace», чтобы открыть этот экран.",
			};

	return [
		{
			id: "agentNative.reviewPermissions",
			title: "Проверить разрешения агента",
			section: "navigation",
			icon: ShieldCheckIcon,
			keywords: [
				"agent",
				"агент",
				"разрешения",
				"permissions",
				"доступ",
				"инструменты",
				"tools",
				"guardrails",
			],
			run: (ctx) => ctx.navigate("/settings/agents"),
		},
		{
			id: "agentNative.replayRun",
			title: "Повторить запуск агента",
			section: "navigation",
			icon: HistoryIcon,
			keywords: [
				"agent",
				"агент",
				"replay",
				"повтор",
				"запуск",
				"run",
				"история",
				"автоматизация",
				"automation",
			],
			run: (ctx) => ctx.navigate("/automations"),
		},
		attachSourceCommand,
		{
			id: "agentNative.delegate",
			title: "Делегировать задачу агенту",
			section: "actions",
			icon: UsersIcon,
			keywords: [
				"agent",
				"агент",
				"delegate",
				"делегировать",
				"a2a",
				"subtask",
				"подзадача",
			],
			disabled: true,
			disabledReason:
				"Делегирование между агентами (A2A) ещё в планах — рабочего экрана пока нет.",
		},
	];
}

export const agentNativeProvider: CommandProvider = {
	id: "agentNative",
	provide: (context) => {
		// Gate: only contribute when `agentNative.commandPalette` is enabled AND
		// resolves usable (carried on the context). Absent flag => treat as off.
		if (!context.experimentalAgentCommandPalette) return [];
		return buildAgentNativeCommands({
			sourceMarketplaceEnabled: context.experimentalAgentSourceMarketplace,
		});
	},
};
