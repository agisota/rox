/**
 * Capture payload size limits (spec §10.5/§10.6). All sizes are byte counts.
 */
export const MAX_HTML_BYTES = 100 * 1024; // 100 KB per selected element context
export const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024; // 2 MB

const TRUNCATION_NOTICE = "\n<!-- …truncated by Rox Design Mode… -->";

function byteLength(input: string): number {
	return Buffer.byteLength(input, "utf8");
}

/**
 * Truncates an HTML string to a byte budget, appending a comment marker so the
 * agent knows the content was clipped. Truncates on a UTF-8 boundary.
 */
export function truncateHtml(
	html: string,
	maxBytes: number = MAX_HTML_BYTES,
): { html: string; truncated: boolean } {
	if (byteLength(html) <= maxBytes) return { html, truncated: false };

	const budget = Math.max(0, maxBytes - byteLength(TRUNCATION_NOTICE));
	const buf = Buffer.from(html, "utf8").subarray(0, budget);
	// Drop a trailing partial multi-byte char by decoding leniently then re-encoding.
	const safe = buf.toString("utf8").replace(/�+$/u, "");
	return { html: safe + TRUNCATION_NOTICE, truncated: true };
}

/** Whether a base64 image payload fits the screenshot budget. */
export function isScreenshotWithinLimit(
	byteSize: number,
	maxBytes: number = MAX_SCREENSHOT_BYTES,
): boolean {
	return byteSize <= maxBytes;
}

/** Decoded byte size of a base64 string (without allocating the buffer). */
export function base64ByteSize(base64: string): number {
	const len = base64.length;
	if (len === 0) return 0;
	const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
	return (len * 3) / 4 - padding;
}
