export interface ParsedGitHubRemote {
	provider: "github";
	owner: string;
	name: string;
	url: string;
}

export function parseGitHubRemote(
	remoteUrl: string,
): ParsedGitHubRemote | null {
	const trimmed = remoteUrl.trim();
	const patterns = [
		/^git@github\.com:(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?$/,
		/^ssh:\/\/git@github\.com\/(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?$/,
		/^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?\/?$/,
	];

	for (const pattern of patterns) {
		const match = pattern.exec(trimmed);
		if (!match?.groups?.owner || !match.groups.name) continue;

		return {
			provider: "github",
			owner: match.groups.owner,
			name: match.groups.name,
			url: `https://github.com/${match.groups.owner}/${match.groups.name}`,
		};
	}

	return null;
}

/**
 * Build the URL of a GitHub account's public avatar.
 *
 * GitHub serves avatars at `https://github.com/{owner}.png`; pass `size` to
 * request a specific pixel width (e.g. 64, 200). The owner is URL-encoded so
 * unusual account names can't corrupt the URL.
 */
export function githubAvatarUrl(owner: string, size?: number): string {
	const url = `https://github.com/${encodeURIComponent(owner)}.png`;
	return size ? `${url}?size=${size}` : url;
}
