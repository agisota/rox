/**
 * Shell launch configuration for v2 terminals.
 *
 * Behavioral reference: apps/desktop/src/main/lib/agent-setup/shell-wrappers.ts
 *
 * Upstream patterns:
 * - VS Code: ZDOTDIR for zsh, --init-file for bash, --init-command for fish
 * - Kitty: KITTY_ORIG_ZDOTDIR for zsh, ENV for bash, XDG_DATA_DIRS for fish
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
	type ResolveConfiguredShellOptions,
	resolveConfiguredShell,
} from "./user-shell.ts";

/** Does not default to /bin/zsh — falls back to /bin/sh (POSIX-guaranteed). */
export function resolveLaunchShell(
	baseEnv: Record<string, string>,
	options?: ResolveConfiguredShellOptions,
): string {
	return resolveConfiguredShell(baseEnv, options);
}

export function getRoxShellPaths(roxHomeDir: string): {
	BIN_DIR: string;
	ZSH_DIR: string;
	BASH_DIR: string;
} {
	return {
		BIN_DIR: path.join(roxHomeDir, "bin"),
		ZSH_DIR: path.join(roxHomeDir, "zsh"),
		BASH_DIR: path.join(roxHomeDir, "bash"),
	};
}

function getShellName(shell: string): string {
	return path.basename(shell);
}

/**
 * Matches desktop shell-wrappers.ts fish init: idempotent PATH prepend +
 * OSC 133;A prompt marker (FinalTerm standard) for shell readiness.
 *
 * Protocol ref: https://gitlab.freedesktop.org/Per_Bothner/specifications/blob/master/proposals/semantic-prompts.md
 */
function buildFishInitCommand(binDir: string): string {
	const escaped = binDir
		.replaceAll("\\", "\\\\")
		.replaceAll('"', '\\"')
		.replaceAll("$", "\\$");
	return [
		`set -l _rox_bin "${escaped}"`,
		`contains -- "$_rox_bin" $PATH`,
		`or set -gx PATH "$_rox_bin" $PATH`,
		`function _rox_prompt_mark --on-event fish_prompt`,
		`printf '\\033]133;A\\007'`,
		`end`,
	].join("; ");
}

export interface ShellBootstrapParams {
	shell: string;
	baseEnv: Record<string, string>;
	roxHomeDir: string;
}

/**
 * Private bootstrap env for shell startup redirection.
 * Only zsh needs env vars (ZDOTDIR). Bash/fish use args only.
 */
export function getShellBootstrapEnv(
	params: ShellBootstrapParams,
): Record<string, string> {
	const { shell, baseEnv, roxHomeDir } = params;
	const shellName = getShellName(shell);
	const paths = getRoxShellPaths(roxHomeDir);

	if (shellName === "zsh") {
		const zshrc = path.join(paths.ZSH_DIR, ".zshrc");
		if (existsSync(zshrc)) {
			return {
				ROX_ORIG_ZDOTDIR: baseEnv.ZDOTDIR || baseEnv.HOME || homedir(),
				ZDOTDIR: paths.ZSH_DIR,
			};
		}
	}

	return {};
}

export interface ShellLaunchParams {
	shell: string;
	roxHomeDir: string;
}

export function getShellLaunchArgs(params: ShellLaunchParams): string[] {
	const { shell, roxHomeDir } = params;
	const shellName = getShellName(shell);
	const paths = getRoxShellPaths(roxHomeDir);

	if (shellName === "zsh") {
		return ["-l"];
	}

	if (shellName === "bash") {
		const rcfile = path.join(paths.BASH_DIR, "rcfile");
		if (existsSync(rcfile)) {
			return ["--rcfile", rcfile];
		}
		return ["-l"];
	}

	if (shellName === "fish") {
		return ["-l", "--init-command", buildFishInitCommand(paths.BIN_DIR)];
	}

	if (shellName === "sh" || shellName === "ksh") {
		return ["-l"];
	}

	return [];
}
