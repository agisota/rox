import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import type { HostDb } from "../../db";
import { type AgentInstallStatus, agentInstallState } from "../../db/schema";
import { getStrictShellEnvironment } from "../../terminal/clean-shell-env";
import { getConfigTemplate } from "./config-templates";
import {
	buildPreinstallCatalog,
	type PreinstallCatalogItem,
	resolveAutoInstallPlan,
} from "./install-plan";

const execAsync = promisify(exec);

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

const defaultWriteConfigFile: ConfigFileWriter = async (
	absolutePath,
	contents,
) => {
	await mkdir(dirname(absolutePath), { recursive: true });
	await writeFile(absolutePath, contents, "utf8");
};

const defaultCommandRunner: CommandRunner = async (command) => {
	const env = await getStrictShellEnvironment().catch(
		() => process.env as Record<string, string>,
	);
	try {
		const { stdout, stderr } = await execAsync(command, {
			encoding: "utf8",
			env,
			timeout: 5 * 60_000,
		});
		return { exitCode: 0, stdout, stderr };
	} catch (error) {
		const err = error as {
			code?: number;
			stdout?: string;
			stderr?: string;
			message?: string;
		};
		return {
			exitCode: typeof err.code === "number" ? err.code : 1,
			stdout: err.stdout ?? "",
			stderr: err.stderr ?? err.message ?? "",
		};
	}
};

/**
 * Idempotent preinstaller for bundled terminal agents and harnesses.
 *
 * Each item is installed independently: a failure on one is recorded and the
 * rest continue. State is persisted to `agent_install_state` keyed by
 * `presetId`, so restarts skip already-installed items and the renderer can
 * surface progress and retry failures. Auto-install only touches non-optional
 * items with a verified install command.
 */
export class AgentPreinstaller {
	private readonly db: HostDb;
	private readonly runCommand: CommandRunner;
	private readonly writeConfigFile: ConfigFileWriter;
	private readonly homeDir: string;
	private readonly onProgress?: (event: PreinstallProgressEvent) => void;
	private readonly catalog: PreinstallCatalogItem[];
	private runningAuto: Promise<PreinstallItemResult[]> | null = null;
	/**
	 * Set for the duration of an aborted `runAuto`. Once aborted (host
	 * disposing), `recordState` skips its db write — a trailing write from an
	 * item that was already mid-install would otherwise hit a closed handle.
	 */
	private autoSignal: AbortSignal | undefined;

	constructor(options: AgentPreinstallerOptions) {
		this.db = options.db;
		this.runCommand = options.runCommand ?? defaultCommandRunner;
		this.writeConfigFile = options.writeConfigFile ?? defaultWriteConfigFile;
		this.homeDir = options.homeDir ?? homedir();
		this.onProgress = options.onProgress;
		this.catalog = buildPreinstallCatalog();
	}

	/** The static catalog this installer was built from. */
	getCatalog(): PreinstallCatalogItem[] {
		return this.catalog;
	}

	/** Catalog joined with persisted state, for the settings UI. */
	getStatus(): PreinstallStatusEntry[] {
		const rows = this.db.select().from(agentInstallState).all();
		const byPresetId = new Map(rows.map((row) => [row.presetId, row]));
		return this.catalog.map((item) => {
			const row = byPresetId.get(item.presetId);
			return {
				presetId: item.presetId,
				kind: item.kind,
				label: item.label,
				optional: item.optional,
				status: row?.status ?? "pending",
				version: row?.version ?? null,
				lastError: row?.lastError ?? null,
				installedAt: row?.installedAt ?? null,
			};
		});
	}

	private statusByPresetId(): Map<string, AgentInstallStatus> {
		const rows = this.db
			.select({
				presetId: agentInstallState.presetId,
				status: agentInstallState.status,
			})
			.from(agentInstallState)
			.all();
		return new Map(rows.map((row) => [row.presetId, row.status]));
	}

	private recordState(
		item: PreinstallCatalogItem,
		patch: {
			status: AgentInstallStatus;
			version?: string | null;
			lastError?: string | null;
			installedAt?: number | null;
		},
	): void {
		// Host is disposing: the db handle is about to (or did) close. Skip the
		// write rather than throw `Cannot use a closed database` from a trailing
		// state update on an item that was already mid-install when aborted.
		if (this.autoSignal?.aborted) return;
		const now = Date.now();
		this.db
			.insert(agentInstallState)
			.values({
				presetId: item.presetId,
				kind: item.kind,
				status: patch.status,
				version: patch.version ?? null,
				lastError: patch.lastError ?? null,
				installedAt: patch.installedAt ?? null,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: agentInstallState.presetId,
				set: {
					kind: item.kind,
					status: patch.status,
					version: patch.version ?? null,
					lastError: patch.lastError ?? null,
					...(patch.installedAt !== undefined
						? { installedAt: patch.installedAt }
						: {}),
					updatedAt: now,
				},
			})
			.run();
		this.onProgress?.({
			presetId: item.presetId,
			kind: item.kind,
			label: item.label,
			status: patch.status,
			error: patch.lastError ?? undefined,
		});
	}

	private resolveConfigPath(homeRelativePath: string): string {
		return isAbsolute(homeRelativePath)
			? homeRelativePath
			: join(this.homeDir, homeRelativePath);
	}

	private async dropConfigFiles(item: PreinstallCatalogItem): Promise<void> {
		for (const file of item.configFiles) {
			const contents = getConfigTemplate(file.templateRef);
			if (contents === undefined) continue;
			await this.writeConfigFile(this.resolveConfigPath(file.path), contents);
		}
	}

	/**
	 * Install a single catalog item. Idempotent: when `checkCommand` reports
	 * the binary is already present, config files are still dropped and the
	 * item is marked installed without re-running install commands.
	 */
	async installItem(
		item: PreinstallCatalogItem,
	): Promise<PreinstallItemResult> {
		this.recordState(item, { status: "installing" });

		try {
			if (item.checkCommand) {
				const check = await this.runCommand(item.checkCommand);
				if (check.exitCode === 0) {
					await this.dropConfigFiles(item);
					this.recordState(item, {
						status: "installed",
						installedAt: Date.now(),
						lastError: null,
					});
					return {
						presetId: item.presetId,
						status: "installed",
						alreadyPresent: true,
					};
				}
			}

			for (const command of item.installCommands) {
				const result = await this.runCommand(command);
				if (result.exitCode !== 0) {
					const error = `\`${command}\` exited ${result.exitCode}: ${
						result.stderr.trim() || result.stdout.trim()
					}`.trim();
					this.recordState(item, { status: "failed", lastError: error });
					return {
						presetId: item.presetId,
						status: "failed",
						alreadyPresent: false,
						error,
					};
				}
			}

			await this.dropConfigFiles(item);
			this.recordState(item, {
				status: "installed",
				installedAt: Date.now(),
				lastError: null,
			});
			return {
				presetId: item.presetId,
				status: "installed",
				alreadyPresent: false,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.recordState(item, { status: "failed", lastError: message });
			return {
				presetId: item.presetId,
				status: "failed",
				alreadyPresent: false,
				error: message,
			};
		}
	}

	/**
	 * Install every non-optional item that still needs it. Concurrency is
	 * intentionally serial so install commands don't fight over the network or
	 * a shared package manager lock. Re-entrant calls share the in-flight run.
	 */
	runAuto(
		options: { signal?: AbortSignal } = {},
	): Promise<PreinstallItemResult[]> {
		if (this.runningAuto) return this.runningAuto;
		this.autoSignal = options.signal;
		const run = this.runAutoInner(options.signal).finally(() => {
			this.runningAuto = null;
			this.autoSignal = undefined;
		});
		this.runningAuto = run;
		return run;
	}

	private async runAutoInner(
		signal?: AbortSignal,
	): Promise<PreinstallItemResult[]> {
		const plan = resolveAutoInstallPlan(this.catalog, this.statusByPresetId());
		const results: PreinstallItemResult[] = [];
		for (const item of plan) {
			// Stop between items when aborted (e.g. host disposing): the next
			// `installItem` would write to a db that's about to close.
			if (signal?.aborted) break;
			results.push(await this.installItem(item));
		}
		return results;
	}

	/** Force a (re)install of a single item by id — used by the retry action. */
	async runOne(presetId: string): Promise<PreinstallItemResult | undefined> {
		const item = this.catalog.find((entry) => entry.presetId === presetId);
		if (!item) return undefined;
		return this.installItem(item);
	}

	/** Mark an item as skipped so auto-install leaves it alone. */
	skip(presetId: string): boolean {
		const item = this.catalog.find((entry) => entry.presetId === presetId);
		if (!item) return false;
		this.recordState(item, { status: "skipped", lastError: null });
		return true;
	}
}
