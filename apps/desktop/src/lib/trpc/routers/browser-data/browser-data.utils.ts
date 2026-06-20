/**
 * Pure consent-gate logic for the browser-data pipeline (WS-N / D4 / N11).
 *
 * Centralized + unit-tested here so every capture/import/upload entry point can
 * ask the same question ("may we touch this user's browser data right now, for
 * this source?") without re-deriving the rule. The IPC router and the future
 * upload scheduler both call this.
 */

/** The consent fields the gate cares about (subset of the local-db row). */
export interface ConsentState {
	accepted: boolean;
	revokedAt: number | null;
	sources: string[];
}

/**
 * Whether ANY browser-data capture/upload is permitted: consent exists, is
 * accepted, and has not been revoked.
 */
export function isConsentActive(consent: ConsentState | null): boolean {
	return consent?.accepted === true && consent.revokedAt === null;
}

/**
 * Whether importing from a specific OS-browser `source` is permitted: consent is
 * active AND the user explicitly allowed that source.
 */
export function canImportFromSource(
	consent: ConsentState | null,
	source: string,
): boolean {
	return (
		isConsentActive(consent) && (consent?.sources.includes(source) ?? false)
	);
}
