/**
 * Parses and transforms raw GitHub PR data from CLI output.
 * Filters valid PR objects and maps them to our internal format.
 */
export function isRawPullRequest(item: unknown): item is {
	number: number;
	title: string;
	url: string;
	state: string;
	isDraft: boolean;
} {
	if (typeof item !== "object" || item === null) return false;

	const value = item as Record<string, unknown>;
	return (
		typeof value.number === "number" &&
		typeof value.title === "string" &&
		typeof value.url === "string" &&
		typeof value.state === "string" &&
		typeof value.isDraft === "boolean"
	);
}

export function parsePullRequests(raw: unknown) {
	if (!Array.isArray(raw)) return [];

	return raw.filter(isRawPullRequest).map((pr) => ({
		prNumber: pr.number,
		title: pr.title,
		url: pr.url,
		state: pr.isDraft
			? "draft"
			: pr.state === "OPEN"
				? "open"
				: pr.state.toLowerCase(),
	}));
}
