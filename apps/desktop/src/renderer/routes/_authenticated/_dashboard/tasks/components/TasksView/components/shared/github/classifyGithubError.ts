import type { GithubFetchError } from "./types";

/**
 * Turn a thrown fetch error + the current online state into a typed,
 * RU-localized {@link GithubFetchError} so the error card can show the right
 * remediation. The recon flagged that `retry:false` previously swallowed these
 * into a flat muted line; here we distinguish:
 *
 *  - offline      → device has no network ("Хост недоступен — проверьте сеть")
 *  - gh-auth      → `gh` is not authed ("Нужна авторизация GitHub")
 *  - unknown      → anything else, surfaced verbatim
 */
export function classifyGithubError(
	error: unknown,
	isOnline: boolean,
): GithubFetchError {
	const raw =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "Неизвестная ошибка";

	if (!isOnline) {
		return {
			kind: "offline",
			message: "Хост недоступен — проверьте, что устройство в сети.",
			raw,
		};
	}

	const lowered = raw.toLowerCase();
	const looksLikeAuth =
		lowered.includes("gh auth") ||
		lowered.includes("authentication") ||
		lowered.includes("unauthorized") ||
		lowered.includes("not logged") ||
		lowered.includes("requires authentication") ||
		lowered.includes("bad credentials") ||
		lowered.includes("401");

	if (looksLikeAuth) {
		return {
			kind: "gh-auth",
			message: "Нужна авторизация GitHub (gh auth login).",
			raw,
		};
	}

	const looksLikeNetwork =
		lowered.includes("fetch failed") ||
		lowered.includes("econnrefused") ||
		lowered.includes("network") ||
		lowered.includes("timeout") ||
		lowered.includes("enotfound");

	if (looksLikeNetwork) {
		return {
			kind: "offline",
			message: "Хост недоступен — проверьте, что устройство в сети.",
			raw,
		};
	}

	return {
		kind: "unknown",
		message: raw,
		raw,
	};
}
