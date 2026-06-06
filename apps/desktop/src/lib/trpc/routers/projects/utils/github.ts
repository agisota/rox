import { execWithShellEnv } from "../../workspaces/utils/shell-env";

/**
 * Fetches the GitHub owner (user or org) for a repository using the `gh` CLI.
 * Returns null if `gh` is not installed, not authenticated, or on error.
 */
export async function fetchGitHubOwner(
	repoPath: string,
): Promise<string | null> {
	try {
		const { stdout } = await execWithShellEnv(
			"gh",
			["repo", "view", "--jq", ".owner.login"],
			{ cwd: repoPath },
		);
		const owner = stdout.trim();
		return owner || null;
	} catch {
		return null;
	}
}
