/**
 * Builds the Fibery JSON command API endpoint for a given account.
 *
 * Fibery exposes a single command endpoint per workspace at
 * `https://{account}.fibery.io/api/commands`, where `account` is the workspace
 * subdomain (e.g. `acme` for `acme.fibery.io`). Callers POST an array of
 * commands and receive an array of `{ success, result }` envelopes.
 */
export function fiberyCommandsUrl(account: string): string {
	return `https://${account}.fibery.io/api/commands`;
}
