/**
 * Deterministic per-org Electric collection ids.
 *
 * The runtime collections in `collections.ts` build their `id` from these same
 * `<table>-<organizationId>` strings. Keeping the id derivation in a pure helper
 * lets us assert the contract (e.g. `v2_workspaces-<org>`) in unit tests without
 * instantiating real Electric collections (which require network + env).
 */
export function orgCollectionId(table: string, organizationId: string): string {
	return `${table}-${organizationId}`;
}
