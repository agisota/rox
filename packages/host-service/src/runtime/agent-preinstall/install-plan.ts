import {
	BUILTIN_AGENT_DEFINITIONS,
	isTerminalAgentDefinition,
} from "@rox/shared/agent-catalog";
import {
	type AgentUpdateStrategy,
	resolveInstallCommands,
} from "@rox/shared/agent-definition";
import {
	AGENT_HARNESS_PRESETS,
	type HarnessAuditReceipt,
	type HarnessInstallPlatform,
	type HarnessInstallStep,
} from "@rox/shared/agent-harness-presets";
import type { AgentInstallStatus } from "../../db/schema";

/**
 * Coerce a Node `process.platform` value to the three desktop targets Rox
 * ships installers for. Anything outside the trio (e.g. `freebsd`) maps to
 * `linux`, which is the closest install path (apt/distro shells).
 */
function toHarnessPlatform(platform: NodeJS.Platform): HarnessInstallPlatform {
	if (platform === "darwin") return "darwin";
	if (platform === "win32") return "win32";
	return "linux";
}

/**
 * Keep only the install steps that apply to the current OS. A step with no
 * `platforms` list runs everywhere; a scoped step runs only when the current
 * platform is listed. This is what makes a per-OS install command table (e.g.
 * `brew` on darwin vs `winget` on win32) collapse to the single command that
 * is valid on the running machine.
 */
function filterStepsForPlatform(
	steps: readonly HarnessInstallStep[],
	platform: HarnessInstallPlatform,
): string[] {
	return steps
		.filter(
			(step) =>
				step.platforms === undefined || step.platforms.includes(platform),
		)
		.map((step) => step.command);
}

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
	/**
	 * Release-train audit receipt copied verbatim from the shared harness
	 * catalog. Reuses the canonical `HarnessAuditReceipt` so the union-typed
	 * installer source, size risk, and preset strategy survive the hop into
	 * host-service instead of being widened to plain strings. `undefined` for
	 * agent items, which carry no harness receipt.
	 */
	audit?: HarnessAuditReceipt;
}

/**
 * Build the full preinstall catalog from the shared agent + harness presets.
 * Pure and deterministic so it can be unit-tested without a DB. `platform`
 * defaults to the running OS and scopes per-OS harness install steps (so only
 * the current-platform command survives into `installCommands`); pass it
 * explicitly to test the other targets.
 */
export function buildPreinstallCatalog(
	platform: NodeJS.Platform = process.platform,
): PreinstallCatalogItem[] {
	const harnessPlatform = toHarnessPlatform(platform);
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
				audit: undefined,
			};
		});

	const harnesses: PreinstallCatalogItem[] = AGENT_HARNESS_PRESETS.map(
		(harness) => {
			const installCommands = filterStepsForPlatform(
				harness.install,
				harnessPlatform,
			);
			return {
				presetId: harness.id,
				kind: "harness" as const,
				label: harness.label,
				installCommands,
				configFiles: harness.configFiles.map((file) => ({
					path: file.path,
					templateRef: file.templateRef,
					overwrite: file.overwrite,
				})),
				// Optional when explicitly flagged or when no install command applies
				// on the current OS (after platform filtering), so a harness with only
				// other-platform steps is never auto-installed here.
				optional: harness.optional ?? installCommands.length === 0,
				updateStrategy: "latest" as const,
				audit: harness.audit,
			};
		},
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
