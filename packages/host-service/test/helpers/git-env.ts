/**
 * Hermetic environment for git subprocesses spawned by integration tests.
 *
 * Production's `LocalGitCredentialProvider` hands git the full `process.env`
 * (so git finds its binary via PATH and a HOME for config). We mirror that —
 * git needs PATH/HOME to run — but force a hermetic *config* surface so tests
 * never inherit the host/CI machine's git configuration:
 *
 *   - `GIT_CONFIG_SYSTEM=/dev/null` ignores `/etc/gitconfig`
 *   - `GIT_CONFIG_GLOBAL=/dev/null` ignores `~/.gitconfig`
 *   - `GIT_TERMINAL_PROMPT=0` makes auth fail fast instead of blocking on a prompt
 *   - `GIT_OPTIONAL_LOCKS=0` matches the production git factory
 *
 * Why this matters: the previous test credential fake returned `{ env: {} }`,
 * which stripped HOME (hiding `~/.gitconfig`) but left `/etc/gitconfig` in
 * play. On GitHub's runners that system config carries a `credential.helper`
 * and can enable `core.fsmonitor`; the latter spawns a long-lived
 * `git fsmonitor--daemon` per repo. Under that config, `git worktree list`
 * and friends blocked for 60s+ and leaked as "dangling processes" that the
 * runner eventually SIGKILLed — turning the adopt integration tests red only
 * in CI. Neutralizing the external config removes the daemon entirely.
 */
export function hermeticGitEnv(
	extra: Record<string, string> = {},
): Record<string, string> {
	// Keep PATH/HOME/locale (git needs them to run) but drop every inherited
	// `GIT_*` var. Inherited git env (GIT_DIR, GIT_WORK_TREE, GIT_SSH,
	// GIT_EDITOR, …) is exactly what we don't want leaking into test repos, and
	// some of it (e.g. GIT_EDITOR) trips simple-git's "unsafe" plugin in the
	// fixture's plain client. We then set only the git vars we control below.
	const base: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value === undefined) continue;
		if (key.startsWith("GIT_")) continue;
		base[key] = value;
	}
	return {
		...base,
		GIT_CONFIG_SYSTEM: "/dev/null",
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_TERMINAL_PROMPT: "0",
		GIT_OPTIONAL_LOCKS: "0",
		...extra,
	};
}
