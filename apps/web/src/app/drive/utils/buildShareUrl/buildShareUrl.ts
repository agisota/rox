/**
 * Build the public, copyable share URL for a Drive share token.
 *
 * The public landing route is `/d/<token>` (see `apps/web/src/app/d/[token]`),
 * served from the web origin (rox.one in production). The base is taken from
 * `NEXT_PUBLIC_WEB_URL` so the link is correct across dev / preview / prod, with
 * a graceful fallback to the canonical production origin.
 */

const FALLBACK_ORIGIN = "https://rox.one";

export function buildShareUrl(token: string, webUrl?: string | null): string {
	const base = (webUrl ?? FALLBACK_ORIGIN).replace(/\/+$/, "");
	return `${base}/d/${token}`;
}
