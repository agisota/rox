/**
 * Coerce an unknown thrown value into a human-readable message string.
 *
 * This is the single home for the `err instanceof Error ? err.message : String(err)`
 * idiom that was previously hand-rolled across apps and packages.
 */
export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
