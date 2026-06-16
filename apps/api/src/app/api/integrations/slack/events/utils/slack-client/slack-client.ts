import { decodeSecret } from "@rox/trpc/integration-secret";
import { WebClient } from "@slack/web-api";

/**
 * Build a Slack `WebClient` from a stored connection token. The token is run
 * through {@link decodeSecret} so an encrypted-at-rest token works; legacy
 * plaintext tokens pass through unchanged.
 */
export function createSlackClient(token: string): WebClient {
	return new WebClient(decodeSecret(token));
}
