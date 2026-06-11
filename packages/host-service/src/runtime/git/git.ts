import { createUserSimpleGit } from "./simple-git";
import type { GitCredentialProvider, GitFactory } from "./types";
import { getRemoteUrl } from "./utils";

export function createGitFactory(provider: GitCredentialProvider): GitFactory {
	return async (repoPath: string) => {
		const initialCredentials = await provider.getCredentials(null);
		// `GIT_TERMINAL_PROMPT=0` makes git fail fast instead of blocking forever
		// on an interactive credential/passphrase prompt — this is a
		// non-interactive service (no TTY), so a prompt would hang the request.
		const git = createUserSimpleGit(repoPath).env({
			...initialCredentials.env,
			GIT_TERMINAL_PROMPT: "0",
		});
		const remoteUrl = await getRemoteUrl(git);
		const credentials = await provider.getCredentials(remoteUrl);

		return git.env({
			...initialCredentials.env,
			...credentials.env,
			GIT_OPTIONAL_LOCKS: "0",
			GIT_TERMINAL_PROMPT: "0",
		});
	};
}
