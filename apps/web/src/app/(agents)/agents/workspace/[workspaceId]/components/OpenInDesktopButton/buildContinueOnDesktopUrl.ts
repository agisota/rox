import { PROTOCOL_SCHEMES } from "@rox/shared/constants";

/**
 * Build the "continue on desktop" deep link the web cabinet emits (WS-B T8).
 *
 * The desktop registers `rox://` (prod) / `rox-<workspace>` (dev) as an OS
 * protocol handler and routes incoming links through `processDeepLink`
 * (`apps/desktop/src/main/index.ts`). WS-A wires the desktop renderer route for
 * `agents/workspace/:id`; this helper produces the URL it consumes:
 *
 *   rox://agents/workspace/<workspaceId>?host=<routingKey>
 *
 * The `host` routing key lets the desktop attach to the SAME host the web
 * session is using (relay to another machine) instead of guessing its own
 * local host. Both `workspaceId` and `routingKey` are URL-encoded so colons in
 * the `org:machine` routing key survive the query string.
 */
export function buildContinueOnDesktopUrl(
	workspaceId: string,
	routingKey: string,
	scheme: string = PROTOCOL_SCHEMES.PROD,
): string {
	const path = `agents/workspace/${encodeURIComponent(workspaceId)}`;
	const query = `host=${encodeURIComponent(routingKey)}`;
	return `${scheme}://${path}?${query}`;
}
