/**
 * Routing key the relay uses to identify a host service tunnel. The same
 * physical machine can be a host in multiple orgs, so machineId alone is
 * not unique on the relay's tunnel map — scope it by org.
 *
 * Lives in its own module (not host-info) so the renderer can import it
 * without pulling in node:child_process / node:fs.
 */
export function buildHostRoutingKey(
	organizationId: string,
	machineId: string,
): string {
	return `${organizationId}:${machineId}`;
}

export function parseHostRoutingKey(
	key: string,
): { organizationId: string; machineId: string } | null {
	const idx = key.indexOf(":");
	if (idx <= 0 || idx === key.length - 1) return null;
	return {
		organizationId: key.slice(0, idx),
		machineId: key.slice(idx + 1),
	};
}

/**
 * Network endpoint for a remote host / sandbox. Local "this device" hosts have
 * no endpoint (they tunnel through the relay); managed remote hosts expose a
 * reachable `host:port` with an optional `protocol` so the UI can surface and
 * connect directly.
 */
export interface HostEndpoint {
	host: string;
	port: number;
	protocol?: string;
}

const DEFAULT_HOST_PROTOCOL = "https";

/**
 * Encode a remote host endpoint into a stable string the schema/UI can store
 * and round-trip: `protocol://host:port` (e.g. `https://sbx.daytona.io:443`).
 */
export function buildHostEndpoint(endpoint: HostEndpoint): string {
	const protocol = endpoint.protocol ?? DEFAULT_HOST_PROTOCOL;
	return `${protocol}://${endpoint.host}:${endpoint.port}`;
}

/**
 * Parse an endpoint string produced by {@link buildHostEndpoint}, or the looser
 * `host:port` form (protocol then defaults to https). Returns null when the
 * value is missing a host or a valid numeric port.
 */
export function parseHostEndpoint(value: string): HostEndpoint | null {
	const trimmed = value.trim();
	if (!trimmed) return null;

	let protocol = DEFAULT_HOST_PROTOCOL;
	let rest = trimmed;
	const schemeIdx = trimmed.indexOf("://");
	if (schemeIdx > 0) {
		protocol = trimmed.slice(0, schemeIdx);
		rest = trimmed.slice(schemeIdx + 3);
	}

	const portIdx = rest.lastIndexOf(":");
	if (portIdx <= 0 || portIdx === rest.length - 1) return null;
	const host = rest.slice(0, portIdx);
	const port = Number(rest.slice(portIdx + 1));
	if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
		return null;
	}

	return { host, port, protocol };
}

/**
 * Render a host:port (with protocol) for display, used by the desktop host
 * settings. Returns null when there is no reachable port.
 */
export function formatHostAddress(
	port: number | null | undefined,
	protocol?: string | null,
	host?: string | null,
): string | null {
	if (port == null) return null;
	const base = host ? `${host}:${port}` : `:${port}`;
	return protocol ? `${protocol}://${base}` : base;
}
