// Callers must additionally reject dot-only names (".", "..") to prevent path traversal
export const SAFE_REPO_NAME_REGEX = /^[a-zA-Z0-9._\- ]+$/;

/** Extract the repository name from a git URL (HTTPS, SSH, or git:// protocol). */
export function extractRepoName(urlInput: string): string | null {
	let normalized = urlInput.trim().replace(/\/+$/, "");

	if (!normalized) return null;

	let repoSegment: string | undefined;

	try {
		const parsed = new URL(normalized);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			const pathname = parsed.pathname;
			repoSegment = pathname.split("/").filter(Boolean).pop();
		}
	} catch {
		// Not a standard URL — fall through to SSH-style parsing
	}

	if (!repoSegment) {
		const colonIndex = normalized.indexOf(":");
		if (colonIndex !== -1 && !normalized.includes("://")) {
			normalized = normalized.slice(colonIndex + 1);
		}
		repoSegment = normalized.split("/").filter(Boolean).pop();
	}

	if (!repoSegment) return null;

	repoSegment = repoSegment.split("?")[0].split("#")[0];
	repoSegment = repoSegment.replace(/\.git$/, "");

	try {
		repoSegment = decodeURIComponent(repoSegment);
	} catch {}

	repoSegment = repoSegment.trim();

	if (!repoSegment || !SAFE_REPO_NAME_REGEX.test(repoSegment)) {
		return null;
	}

	return repoSegment;
}
