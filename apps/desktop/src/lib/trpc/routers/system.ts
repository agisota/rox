import { publicProcedure, router } from "..";
import { getGitAuthorName, getGitHubUsername } from "./workspaces/utils/git";
import { execGitWithShellPath } from "./workspaces/utils/git-client";
import { execWithShellEnv } from "./workspaces/utils/shell-env";

interface GhDetectResult {
	installed: boolean;
	authenticated: boolean;
	version: string | null;
	path: string | null;
}

interface GitDetectResult {
	installed: boolean;
	version: string | null;
	path: string | null;
}

/**
 * System tool we can force-install: a CLI binary with a per-OS install command
 * table. Only the command for the current `process.platform` is ever run, so a
 * darwin machine never tries `winget` and vice-versa.
 */
type SystemToolId = "git" | "gh";

interface SystemToolInstallStep {
	/** Tool being installed, for progress reporting. */
	tool: SystemToolId;
	/** Argv-style command: `command` + `args`, run via the login-shell PATH. */
	command: string;
	args: string[];
	/**
	 * When true the tool can't be auto-installed by the OS package manager (e.g.
	 * `gh` is not in default Debian/Ubuntu apt repos). The step is reported as a
	 * "manual" outcome with `manualInstallUrl` instead of being executed, so we
	 * never run a guaranteed-to-fail command that would abort the transaction.
	 */
	manualOnly?: boolean;
	/** Per-tool manual install link, used when `manualOnly` is set. */
	manualInstallUrl?: string;
	/** When true the step is run via `sudo` and requires a prior sudo probe. */
	requiresSudo?: boolean;
}

interface SystemToolInstallResult {
	/** False when the OS package manager is missing or a step failed. */
	ok: boolean;
	/** Per-step outcomes, in run order, for progress display. */
	steps: Array<{
		tool: SystemToolId;
		command: string;
		status: "ok" | "failed" | "skipped" | "manual";
		error?: string;
		/** Set on `manual` steps so the renderer can route to the right link. */
		manualInstallUrl?: string;
	}>;
	/**
	 * Set when the platform's package manager itself is unavailable (e.g. no
	 * Homebrew). The renderer surfaces this with a manual-install link instead of
	 * treating it as a hard crash.
	 */
	packageManagerMissing?: boolean;
	/**
	 * Set on Linux when a `sudo` step is required but passwordless sudo isn't
	 * available (`sudo -n true` fails — no cached credentials / no TTY). The
	 * renderer routes to the manual-install link instead of surfacing a cryptic
	 * sudo error.
	 */
	sudoUnavailable?: boolean;
	/** Manual install link to fall back to when an auto-install can't run. */
	manualInstallUrl: string;
}

const MANUAL_INSTALL_URL = "https://github.com/git-guides/install-git";
/** GitHub CLI install instructions, used when `gh` can't be auto-installed. */
const GH_MANUAL_INSTALL_URL = "https://github.com/cli/cli#installation";

/**
 * Per-OS install commands for git + gh. Mirrors `HarnessInstallStep.platforms`
 * filtering in the host-service preinstall engine, but lives in the desktop
 * main process so onboarding can drive it directly (before any host exists).
 * Only the entry matching the current `process.platform` is returned.
 */
export function gitToolsInstallPlan(
	platform: NodeJS.Platform,
): SystemToolInstallStep[] {
	switch (platform) {
		case "darwin":
			// Homebrew installs both in one invocation.
			return [{ tool: "git", command: "brew", args: ["install", "git", "gh"] }];
		case "win32":
			return [
				{
					tool: "git",
					command: "winget",
					args: ["install", "--id", "Git.Git", "-e", "--source", "winget"],
				},
				{
					tool: "gh",
					command: "winget",
					args: ["install", "--id", "GitHub.cli", "-e", "--source", "winget"],
				},
			];
		default:
			// Linux (and any non-trio platform): apt-based default. Distros without
			// apt fall through to the package-manager-missing path below.
			//
			// git: installable via apt as its own step (so a gh failure can't abort
			// the git transaction). gh: NOT in default Debian/Ubuntu apt repos, and
			// adding GitHub's apt source is heavy/root-mutating — so route gh to its
			// manual-install link rather than running a guaranteed-to-fail
			// `apt-get install gh`.
			return [
				{
					tool: "git",
					command: "sudo",
					args: ["apt-get", "install", "-y", "git"],
					requiresSudo: true,
				},
				{
					tool: "gh",
					command: "gh",
					args: [],
					manualOnly: true,
					manualInstallUrl: GH_MANUAL_INSTALL_URL,
				},
			];
	}
}

/** The package-manager binary the current OS's install plan depends on. */
function packageManagerForPlatform(platform: NodeJS.Platform): string {
	switch (platform) {
		case "darwin":
			return "brew";
		case "win32":
			return "winget";
		default:
			return "apt-get";
	}
}

async function detectGit(): Promise<GitDetectResult> {
	// Resolve `git` via the user's login-shell PATH (execGitWithShellPath is the
	// repo-sanctioned git runner), so we find it wherever it lives.
	try {
		const { stdout } = await execGitWithShellPath(["--version"], {
			timeout: 5000,
		});
		const firstLine = stdout.split("\n")[0]?.trim() ?? "";
		const version = firstLine.match(/git version (\S+)/)?.[1] ?? null;
		return { installed: true, version, path: "git" };
	} catch {
		return { installed: false, version: null, path: null };
	}
}

async function detectGhCli(): Promise<GhDetectResult> {
	// Resolve `gh` via the user's login-shell PATH (execWithShellEnv retries with
	// the derived shell env on ENOENT), so we find it wherever it's installed —
	// homebrew, MacPorts, nix, asdf, etc. — not just a hardcoded path list.
	let version: string | null = null;
	try {
		const { stdout } = await execWithShellEnv("gh", ["--version"], {
			timeout: 5000,
		});
		const firstLine = stdout.split("\n")[0]?.trim() ?? "";
		version = firstLine.match(/gh version (\S+)/)?.[1] ?? null;
	} catch {
		return {
			installed: false,
			authenticated: false,
			version: null,
			path: null,
		};
	}

	let authenticated = false;
	try {
		await execWithShellEnv(
			"gh",
			["auth", "status", "--active", "--hostname", "github.com"],
			{ timeout: 5000 },
		);
		authenticated = true;
	} catch {
		// `gh auth status` exits non-zero when not logged in.
	}

	return { installed: true, authenticated, version, path: "gh" };
}

/** True when the OS package manager the install plan needs is on PATH. */
async function hasPackageManager(binary: string): Promise<boolean> {
	try {
		await execWithShellEnv(binary, ["--version"], { timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}

/**
 * Non-interactive sudo probe. `sudo -n true` succeeds only when sudo can run
 * without prompting (cached credentials or NOPASSWD). On a real non-dev machine
 * with no passwordless sudo / no TTY it fails fast, letting us route to manual
 * install instead of emitting a cryptic sudo password error.
 */
async function probePasswordlessSudo(): Promise<boolean> {
	try {
		await execWithShellEnv("sudo", ["-n", "true"], { timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}

/** Injectable dependencies so the install flow can be unit-tested. */
interface InstallGitToolsDeps {
	platform: NodeJS.Platform;
	hasPackageManager: (binary: string) => Promise<boolean>;
	probePasswordlessSudo: () => Promise<boolean>;
	runStep: (command: string, args: string[]) => Promise<void>;
}

const defaultInstallGitToolsDeps: InstallGitToolsDeps = {
	platform: process.platform,
	hasPackageManager,
	probePasswordlessSudo,
	runStep: async (command, args) => {
		await execWithShellEnv(command, args, { timeout: 300_000 });
	},
};

/**
 * Force-install git + gh using the current OS's package manager. Each step runs
 * sequentially; a failure is recorded and the remaining steps are skipped.
 *
 * Early-exit paths that route the renderer to a manual-install link instead of
 * surfacing a hard error:
 * - `packageManagerMissing`: the package manager itself is absent.
 * - `sudoUnavailable`: a `sudo` step is required but passwordless sudo isn't
 *   available (`sudo -n true` fails).
 *
 * Steps marked `manualOnly` (e.g. `gh` on Linux, which isn't in default apt
 * repos) are reported with a `manual` status + per-tool link rather than being
 * executed; they don't fail the run, so a manual `gh` never blocks the git
 * install.
 */
export async function installGitTools(
	deps: InstallGitToolsDeps = defaultInstallGitToolsDeps,
): Promise<SystemToolInstallResult> {
	const plan = gitToolsInstallPlan(deps.platform);
	const packageManager = packageManagerForPlatform(deps.platform);

	if (!(await deps.hasPackageManager(packageManager))) {
		return {
			ok: false,
			packageManagerMissing: true,
			manualInstallUrl: MANUAL_INSTALL_URL,
			steps: plan.map((step) => ({
				tool: step.tool,
				command: `${step.command} ${step.args.join(" ")}`,
				status: "skipped" as const,
				error: `Менеджер пакетов «${packageManager}» не найден.`,
			})),
		};
	}

	// If any executable step needs sudo, probe once up front. Without
	// passwordless sudo there's no way to drive an interactive prompt from the
	// GUI, so route to manual install rather than hanging or erroring cryptically.
	const needsSudo = plan.some((step) => step.requiresSudo && !step.manualOnly);
	if (needsSudo && !(await deps.probePasswordlessSudo())) {
		return {
			ok: false,
			sudoUnavailable: true,
			manualInstallUrl: MANUAL_INSTALL_URL,
			steps: plan.map((step) =>
				step.manualOnly
					? {
							tool: step.tool,
							command: `${step.command} ${step.args.join(" ")}`.trim(),
							status: "manual" as const,
							manualInstallUrl: step.manualInstallUrl ?? MANUAL_INSTALL_URL,
						}
					: {
							tool: step.tool,
							command: `${step.command} ${step.args.join(" ")}`,
							status: "skipped" as const,
							error: "Требуются права sudo без пароля, но они недоступны.",
						},
			),
		};
	}

	const steps: SystemToolInstallResult["steps"] = [];
	let ok = true;
	for (const step of plan) {
		const printable = `${step.command} ${step.args.join(" ")}`.trim();
		// Tools that can't be auto-installed (e.g. gh via apt) are surfaced as a
		// manual link, not run and not counted as a failure.
		if (step.manualOnly) {
			steps.push({
				tool: step.tool,
				command: printable,
				status: "manual",
				manualInstallUrl: step.manualInstallUrl ?? MANUAL_INSTALL_URL,
			});
			continue;
		}
		if (!ok) {
			steps.push({ tool: step.tool, command: printable, status: "skipped" });
			continue;
		}
		try {
			await deps.runStep(step.command, step.args);
			steps.push({ tool: step.tool, command: printable, status: "ok" });
		} catch (error) {
			ok = false;
			steps.push({
				tool: step.tool,
				command: printable,
				status: "failed",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { ok, manualInstallUrl: MANUAL_INSTALL_URL, steps };
}

export const createSystemRouter = () => {
	return router({
		detectGhCli: publicProcedure.query(detectGhCli),
		detectGit: publicProcedure.query(detectGit),
		installGitTools: publicProcedure.mutation(() => installGitTools()),
		/** Detected GitHub account login (via `gh api user`), or null. */
		getGitHubUsername: publicProcedure.query(() => getGitHubUsername()),
		/** Detected local git author name (`git config user.name`), or null. */
		getGitAuthorName: publicProcedure.query(() => getGitAuthorName()),
	});
};

export type SystemRouter = ReturnType<typeof createSystemRouter>;
