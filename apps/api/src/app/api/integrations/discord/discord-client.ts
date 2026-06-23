import { discordOriginalResponseUrl } from "./constants";

/**
 * Minimal Discord interactions client built on `fetch`.
 *
 * The only call the inbound vertical needs is editing the original deferred
 * interaction response so the bot's "thinking…" state resolves to the agent's
 * answer. That edit is authenticated by the interaction continuation token in
 * the URL (no bot Authorization header), mirroring how the Telegram client
 * embeds the bot token in the path.
 *
 * `fetchImpl` is injectable (defaulting to the global `fetch`) so tests can
 * assert URL/method/body without real network I/O, and the function throws a
 * clear `Error` when the transport fails or Discord responds non-2xx.
 */

type FetchImpl = typeof fetch;

/**
 * Edits the original (deferred) interaction response via
 * `PATCH /webhooks/{application_id}/{interaction_token}/messages/@original`.
 *
 * Idempotent by construction: re-issuing the same edit overwrites the message
 * with identical content, so a retried job never produces a duplicate reply.
 */
export async function editOriginalInteractionResponse({
	applicationId,
	interactionToken,
	content,
	fetchImpl = fetch,
}: {
	applicationId: string;
	interactionToken: string;
	content: string;
	fetchImpl?: FetchImpl;
}): Promise<void> {
	const url = discordOriginalResponseUrl(applicationId, interactionToken);

	let response: Response;
	try {
		response = await fetchImpl(url, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ content }),
		});
	} catch (cause) {
		throw new Error("Discord edit original response request failed", { cause });
	}

	if (!response.ok) {
		// Discord error envelopes carry `{ message, code }`; surface the message
		// when present without assuming a body exists.
		let detail = `status ${response.status}`;
		try {
			const body = (await response.json()) as { message?: string };
			if (body?.message) {
				detail = `${body.message} (status ${response.status})`;
			}
		} catch {
			// Non-JSON / empty body: keep the status-only detail.
		}
		throw new Error(`Discord edit original response failed: ${detail}`);
	}
}
