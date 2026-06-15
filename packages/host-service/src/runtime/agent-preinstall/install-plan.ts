import {
	BUILTIN_AGENT_DEFINITIONS,
	isTerminalAgentDefinition,
} from "@rox/shared/agent-catalog";
import {
	type AgentUpdateStrategy,
	resolveInstallCommands,
} from "@rox/shared/agent-definition";
import { AGENT_HARNESS_PRESETS } from "@rox/shared/agent-harness-presets";
import type { AgentInstallStatus } from "../../db/schema";

export type PreinstallItemKind = "agent" | "harness";

export interface PreinstallConfigFile {
	/** Home-relative path where the file is written. */
	path: string;
	/** Key into the config-templates map for the file body. */
	templateRef: string;
	/** False means create the file only when it does not already exist. */
	overwrite?: boolean;
}

/**
 * Flattened, install-ready view of one catalog entry (a builtin terminal
 * agent or a harness). The installer consumes only this shape, so it never
 * has to know whether an item came from the agent or harness catalog.
 */
export interface PreinstallCatalogItem {
	presetId: string;
	kind: PreinstallItemKind;
	label: string;
	/** Command that detects an existing install (exit 0 = already present). */
	checkCommand?: string;
	/** Ordered install commands, run in sequence. */
	installCommands: string[];
	configFiles: PreinstallConfigFile[];
	/** True when no verified install path exists — never auto-installed. */
	optional: boolean;
	/**
	 * Version/update policy for the bundled binary. `"latest"` refreshes to the
	 * newest published version; `"pinned"` installs exactly `pinnedVersion`.
	 * Harnesses always track `"latest"`.
	 */
	updateStrategy: AgentUpdateStrategy;
	/** Exact version installed when `updateStrategy` is `"pinned"`. */
	pinnedVersion?: string;
}

/**
 * Build the full preinstall catalog from the shared agent + harness presets.
 * Pure and deterministic so it can be unit-tested without a DB.
 */
export function buildPreinstallCatalog(): PreinstallCatalogItem[] {
	const agents: PreinstallCatalogItem[] = BUILTIN_AGENT_DEFINITIONS.filter(
		isTerminalAgentDefinition,
	)
		.filter((agent) => agent.install !== undefined)
		.map((agent) => {
			// `install` is guaranteed by the filter above.
			const install = agent.install as NonNullable<typeof agent.install>;
			return {
				presetId: agent.id,
				kind: "agent" as const,
				label: agent.label,
				checkCommand: install.checkCommand,
				installCommands: resolveInstallCommands(install),
				configFiles: [],
				optional: install.optional ?? false,
				updateStrategy: install.updateStrategy ?? "latest",
				pinnedVersion: install.pinnedVersion,
			};
		});

	const harnesses: PreinstallCatalogItem[] = AGENT_HARNESS_PRESETS.map(
		(harness) => ({
			presetId: harness.id,
			kind: "harness" as const,
			label: harness.label,
			installCommands: harness.install.map((step) => step.command),
			configFiles: harness.configFiles.map((file) => ({
				path: file.path,
				templateRef: file.templateRef,
				overwrite: file.overwrite,
			})),
			optional: harness.optional ?? harness.install.length === 0,
			updateStrategy: "latest" as const,
		}),
	);

	return [...agents, ...harnesses];
}

/**
 * An item is eligible for an automatic install attempt when it is not marked
 * optional and its recorded status is one the installer should (re)try.
 * Installed, currently-installing, and user-skipped items are left alone.
 */
export function shouldAutoInstall(
	item: PreinstallCatalogItem,
	status: AgentInstallStatus | undefined,
): boolean {
	if (item.optional) return false;
	if (item.installCommands.length === 0) return false;
	return status === undefined || status === "pending" || status === "failed";
}

/**
 * Resolve which catalog items should be installed automatically given the
 * current persisted state (keyed by `presetId`).
 */
export function resolveAutoInstallPlan(
	catalog: PreinstallCatalogItem[],
	statusByPresetId: ReadonlyMap<string, AgentInstallStatus>,
): PreinstallCatalogItem[] {
	return catalog.filter((item) =>
		shouldAutoInstall(item, statusByPresetId.get(item.presetId)),
	);
}
