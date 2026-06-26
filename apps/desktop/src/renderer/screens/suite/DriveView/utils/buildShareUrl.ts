/**
 * Build the public, copyable share URL for a Drive share token.
 *
 * Ported from `apps/web/src/app/drive/utils/buildShareUrl`. The public landing
 * route is `/d/<token>` served from the web origin. On desktop the base comes
 * from the renderer env (`NEXT_PUBLIC_WEB_URL`, default `https://app.rox.one`)
 * — this replaces the old DriveView stub's hardcoded `https://rox.one/d`
 * constant so dev / preview / prod all resolve correctly.
 */

const FALLBACK_ORIGIN = "https://app.rox.one";

export function buildShareUrl(token: string, webUrl?: string | null): string {
	const base = (webUrl ?? FALLBACK_ORIGIN).replace(/\/+$/, "");
	return `${base}/d/${token}`;
}
