/**
 * Public Drive share URL for a token. Shares resolve at `rox.one/d/<token>`
 * (drive router contract, DQ-shares). Kept pure so it is unit-testable.
 */
export function driveShareUrl(token: string): string {
	return `https://rox.one/d/${token}`;
}
