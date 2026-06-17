/**
 * Remote-origin capture policy (spec §10.3/§10.4). Capturing DOM/CSS from a
 * remote origin can expose private content, so the UI warns before sending unless
 * the origin is a local/dev origin or the user has opted out of warnings.
 */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

export function isLocalOrigin(rawUrl: string): boolean {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		// Non-URL (about:blank, file inputs) — treat as local/non-remote.
		return true;
	}
	if (url.protocol === "file:" || url.protocol === "about:") return true;
	const host = url.hostname.toLowerCase();
	if (LOCAL_HOSTNAMES.has(host)) return true;
	// *.localhost and *.local (mDNS / dev TLDs) are local.
	if (host.endsWith(".localhost") || host.endsWith(".local")) return true;
	// RFC1918 / link-local ranges.
	if (/^10\./.test(host)) return true;
	if (/^192\.168\./.test(host)) return true;
	if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
	if (/^169\.254\./.test(host)) return true;
	return false;
}

export function isRemoteOrigin(rawUrl: string): boolean {
	return !isLocalOrigin(rawUrl);
}

/**
 * Whether the UI should warn before sending a capture for this origin.
 * `warnOnRemote` is the user setting (default true); local origins never warn.
 */
export function shouldWarnBeforeCapture(
	rawUrl: string,
	warnOnRemote = true,
): boolean {
	if (!warnOnRemote) return false;
	return isRemoteOrigin(rawUrl);
}
