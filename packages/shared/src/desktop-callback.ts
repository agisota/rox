/**
 * Validate a desktop OAuth local-callback URL. It must be an **http loopback**
 * URL (`127.0.0.1` / `localhost`) whose path is exactly `/auth/callback`.
 * Returns the parsed `URL` when allowed, otherwise `null`.
 *
 * The desktop sign-in flow mints a session token and hands it to this callback,
 * so the callback MUST be locked to a loopback handler — pointing it at an
 * arbitrary host would exfiltrate the token (account takeover). Both
 * `/api/auth/desktop/connect` and the directly-reachable `/auth/desktop/success`
 * page validate through here so the allow-list can't drift out of sync between
 * the two entry points (the success page previously skipped validation, which
 * was the exfiltration vector this consolidates away).
 */
export function parseDesktopLoopbackCallback(
	base: string | null | undefined,
): URL | null {
	if (!base) return null;

	let url: URL;
	try {
		url = new URL(base);
	} catch {
		return null;
	}

	const isLoopback =
		url.protocol === "http:" &&
		(url.hostname === "127.0.0.1" || url.hostname === "localhost");
	if (!isLoopback || url.pathname !== "/auth/callback") {
		return null;
	}

	return url;
}
