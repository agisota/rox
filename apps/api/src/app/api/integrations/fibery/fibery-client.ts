import { fiberyCommandsUrl } from "./constants";

/**
 * A single command sent to the Fibery JSON command API. The command name (e.g.
 * `fibery.entity/query`) and its `args` are intentionally left open so callers
 * can shape any query; the client only POSTs the array and parses the response.
 */
export interface FiberyCommand {
	command: string;
	args?: unknown;
}

/**
 * One element of the Fibery command response array. Each command echoes back a
 * `success` flag and an opaque `result`. The result shape depends on the
 * command, so it is typed as `unknown` and narrowed by the caller.
 */
export interface FiberyCommandResult {
	success: boolean;
	result: unknown;
}

export interface RunCommandsParams {
	/** Fibery workspace subdomain (e.g. `acme` for `acme.fibery.io`). */
	account: string;
	/** Fibery API token sent as `Authorization: Token {token}`. */
	token: string;
	/** Commands to POST to the command endpoint. */
	commands: FiberyCommand[];
	/**
	 * Injectable fetch implementation. Defaults to the global `fetch` so the
	 * client is testable without network access by passing a mock.
	 */
	fetchImpl?: typeof fetch;
}

/**
 * Executes a batch of commands against the Fibery JSON command API and returns
 * the parsed response array.
 *
 * Throws a clear `Error` on transport failure (the underlying fetch rejected)
 * or when the HTTP response is non-ok, so callers get an actionable message
 * instead of a silently malformed payload.
 */
export async function runCommands({
	account,
	token,
	commands,
	fetchImpl = fetch,
}: RunCommandsParams): Promise<FiberyCommandResult[]> {
	const url = fiberyCommandsUrl(account);

	let response: Response;
	try {
		response = await fetchImpl(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Token ${token}`,
			},
			body: JSON.stringify(commands),
		});
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`Fibery request to ${url} failed: ${reason}`);
	}

	if (!response.ok) {
		const detail = await response.text().catch(() => "");
		throw new Error(
			`Fibery request to ${url} returned ${response.status}${
				detail ? `: ${detail}` : ""
			}`,
		);
	}

	return (await response.json()) as FiberyCommandResult[];
}
