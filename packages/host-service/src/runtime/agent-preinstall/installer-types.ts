import type { HostDb } from "../../db";
import type { AgentInstallStatus } from "../../db/schema";
import type { PreinstallCatalogItem } from "./install-plan";

export interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/** Runs a single shell command string. Injectable so tests never shell out. */
export type CommandRunner = (command: string) => Promise<CommandResult>;

/** Writes a config file (absolute path). Injectable for tests. */
export type ConfigFileWriter = (
	absolutePath: string,
	contents: string,
	options?: { overwrite?: boolean },
) => Promise<void>;

export interface PreinstallProgressEvent {
	presetId: string;
	kind: PreinstallCatalogItem["kind"];
	status: AgentInstallStatus;
	label: string;
	error?: string;
}

export interface PreinstallItemResult {
	presetId: string;
	status: AgentInstallStatus;
	alreadyPresent: boolean;
	error?: string;
}

export interface AgentPreinstallerOptions {
	db: HostDb;
	/** Defaults to a real shell runner using a clean strict shell env. */
	runCommand?: CommandRunner;
	/** Defaults to writing files under the home directory via fs. */
	writeConfigFile?: ConfigFileWriter;
	/** Defaults to `os.homedir()`. */
	homeDir?: string;
	/** Optional progress sink (e.g. logging or an event bus bridge). */
	onProgress?: (event: PreinstallProgressEvent) => void;
}

export interface PreinstallStatusEntry {
	presetId: string;
	kind: PreinstallCatalogItem["kind"];
	label: string;
	optional: boolean;
	status: AgentInstallStatus;
	version: string | null;
	lastError: string | null;
	installedAt: number | null;
}
