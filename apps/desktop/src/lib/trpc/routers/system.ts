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
}

interface SystemToolInstallResult {
	/** False when the OS package manager is missing or a step failed. */
	ok: boolean;
	/** Per-step outcomes, in run order, for progress display. */
	steps: Array<{
		tool: SystemToolId;
		command: string;
		status: "ok" | "failed" | "skipped";
		error?: string;
	}>;
	/**
	 * Set when the platform's package manager itself is unavailable (e.g. no
	 * Homebrew). The renderer surfaces this with a manual-install link instead of
	 * treating it as a hard crash.
	 */
	packageManagerMissing?: boolean;
	/** Manual install link to fall back to when an auto-install can't run. */
	manualInstallUrl: string;
}

const MANUAL_INSTALL_URL = "https://github.com/git-guides/install-git";

/**
 * Per-OS install commands for git + gh. Mirrors `HarnessInstallStep.platforms`
 * filtering in the host-service preinstall engine, but lives in the desktop
 * main process so onboarding can drive it directly (before any host exists).
 * Only the entry matching the current `process.platform` is returned.
 */
function gitToolsInstallPlan(
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
			return [
				{
					tool: "git",
					command: "sudo",
					args: ["apt-get", "install", "-y", "git", "gh"],
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
 * Force-install git + gh using the current OS's package manager. Each step runs
 * sequentially; a failure is recorded and the remaining steps are skipped. When
 * the package manager itself is absent we return early with
 * `packageManagerMissing` so the renderer can show the manual-install link
 * rather than hard-crashing.
 */
async function installGitTools(): Promise<SystemToolInstallResult> {
	const plan = gitToolsInstallPlan(process.platform);
	const packageManager = packageManagerForPlatform(process.platform);

	if (!(await hasPackageManager(packageManager))) {
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

	const steps: SystemToolInstallResult["steps"] = [];
	let ok = true;
	for (const step of plan) {
		const printable = `${step.command} ${step.args.join(" ")}`;
		if (!ok) {
			steps.push({ tool: step.tool, command: printable, status: "skipped" });
			continue;
		}
		try {
			await execWithShellEnv(step.command, step.args, { timeout: 300_000 });
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
		installGitTools: publicProcedure.mutation(installGitTools),
		/** Detected GitHub account login (via `gh api user`), or null. */
		getGitHubUsername: publicProcedure.query(() => getGitHubUsername()),
		/** Detected local git author name (`git config user.name`), or null. */
		getGitAuthorName: publicProcedure.query(() => getGitAuthorName()),
	});
};

export type SystemRouter = ReturnType<typeof createSystemRouter>;
