import {
	createHostClient,
	createHostWriteClient,
	type HostAgentConfig,
	type HostClient,
	type HostKind,
	type HostTarget,
	type HostTerminalSession,
	type HostTransport,
	type HostWriteClient,
} from "@rox/shared/host-client";
import SuperJSON from "superjson";
import { getAuthToken } from "./auth-token";
import { getRelayUrl } from "./relay-url";

// Direct browser → relay → host-service tRPC calls, the same path the
// desktop uses. Inputs/outputs are typed at the boundary rather than via
// the host AppRouter: importing `@rox/host-service` drags host-only
// modules into the web's type-check, which is the reason the cloud's
// `relay-client.ts` also hand-types its host calls.
//
// WS-B T2: this module now implements the shared `HostTransport` over the
// relay and builds a unified `HostClient` (`@rox/shared/host-client`). The
// legacy free functions below are kept as thin wrappers so the existing
// `apps/web/src/app/workspaces/**` screens (read-only for WS-B) keep working.

export type { HostAgentConfig, HostClient, HostTerminalSession };

interface CreateHostTerminalOptions {
	initialCommand?: string;
}

/**
 * Build the relay tRPC URL for a host procedure. Pure + exported so it can be
 * unit-tested without the browser `fetch`/SuperJSON globals. GET inputs are
 * SuperJSON-encoded into the `?input=` query param; POST inputs go in the body.
 */
export function buildHostCallUrl(
	relayBase: string,
	routingKey: string,
	procedure: string,
	encodedInput: ReturnType<typeof SuperJSON.serialize> | undefined,
	method: "GET" | "POST",
): string {
	const base = `${relayBase}/hosts/${routingKey}/trpc/${procedure}`;
	if (method === "GET" && encodedInput !== undefined) {
		return `${base}?input=${encodeURIComponent(JSON.stringify(encodedInput))}`;
	}
	return base;
}

async function hostCall<TOutput>(
	routingKey: string,
	procedure: string,
	input: unknown,
	method: "GET" | "POST",
): Promise<TOutput> {
	const token = await getAuthToken();
	const encoded = input === undefined ? undefined : SuperJSON.serialize(input);
	const url = buildHostCallUrl(
		getRelayUrl(),
		routingKey,
		procedure,
		encoded,
		method,
	);

	const response = await fetch(url, {
		method,
		headers: {
			authorization: `Bearer ${token}`,
			...(method === "POST" ? { "content-type": "application/json" } : {}),
		},
		body:
			method === "POST" && encoded !== undefined
				? JSON.stringify(encoded)
				: undefined,
	});
	if (!response.ok) {
		throw new Error(`host ${procedure} failed (${response.status})`);
	}

	const parsed = (await response.json()) as { result?: { data?: unknown } };
	if (!parsed.result || parsed.result.data === undefined) {
		throw new Error(`host ${procedure}: malformed relay response`);
	}
	return SuperJSON.deserialize(parsed.result.data as never) as TOutput;
}

/**
 * Relay implementation of the shared {@link HostTransport}. Web (and the React
 * Native bundle via the same fetch/WS boundary — D5) dial a host through the
 * Fly relay tunnel with this transport.
 */
export function createRelayTransport(target: HostTarget): HostTransport {
	return {
		kind: "relay",
		target,
		call: (procedure, input, method) =>
			hostCall(target.routingKey, procedure, input, method),
	};
}

/**
 * Build a unified {@link HostClient} that talks to `routingKey` over the relay.
 * This is the convergence entry point every web `(agents)` screen should use.
 */
export function createRelayHostClient(
	routingKey: string,
	kind: HostKind = "local",
): HostClient {
	return createHostClient(
		createRelayTransport({ routingKey, transport: "relay", kind }),
	);
}

/**
 * Build the additive {@link HostWriteClient} (WS-A — Option A) over the relay,
 * mirroring {@link createRelayHostClient}. Same relay transport as the read
 * client — write-capable web screens opt in here; read-only screens keep using
 * {@link createRelayHostClient}.
 */
export function createRelayHostWriteClient(
	routingKey: string,
	kind: HostKind = "local",
): HostWriteClient {
	return createHostWriteClient(
		createRelayTransport({ routingKey, transport: "relay", kind }),
	);
}

export function listHostTerminals(routingKey: string, workspaceId: string) {
	return createRelayHostClient(routingKey).terminal.listSessions(workspaceId);
}

export function createHostTerminal(
	routingKey: string,
	workspaceId: string,
	options: CreateHostTerminalOptions = {},
) {
	return createRelayHostClient(routingKey).terminal.createSession(
		workspaceId,
		options,
	);
}

export function listHostAgentConfigs(routingKey: string) {
	return createRelayHostClient(routingKey).agentConfigs.list();
}

function quoteSingleShell(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildArgvCommand(argv: string[]): string {
	return argv.map(quoteSingleShell).join(" ");
}

function envOverlayPrefix(env: Record<string, string>): string {
	const assignments = Object.entries(env).map(
		([key, value]) => `${key}=${quoteSingleShell(value)}`,
	);
	return assignments.length > 0 ? `${assignments.join(" ")} ` : "";
}

export function buildHostAgentLaunchCommand(config: {
	command: string;
	args: string[];
	env: Record<string, string>;
}) {
	return `${envOverlayPrefix(config.env)}${buildArgvCommand([
		config.command,
		...config.args,
	])}`;
}
