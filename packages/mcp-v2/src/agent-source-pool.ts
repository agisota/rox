import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { db } from "@rox/db/client";
import { agentSources } from "@rox/db/schema";
import { decryptSecret } from "@rox/trpc/crypto";
import { and, eq } from "drizzle-orm";
import type { McpContext } from "./auth";
import type { McpToolCallEmitter } from "./define-tool";

/**
 * A resolved, active agent source for the calling organization. This is the
 * credential-free view (the `agentSource.list` projection); credentials are
 * fetched separately and server-side through the runtime credential loader
 * only when a real downstream transport is connected.
 */
export interface ResolvedAgentSource {
	id: string;
	slug: string;
	kind: string;
	endpointUrl: string | null;
	integrationConnectionId: string | null;
}

/** A downstream tool descriptor (subset of the SDK `Tool` shape). */
export interface DownstreamTool {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

/**
 * A minimal, transport-agnostic MCP downstream client. The proxy depends only
 * on this surface, so the pool can be exercised in tests with a mock client and
 * the real adapters (in-memory + external HTTP) can vary independently. It is a
 * deliberate subset of the SDK `Client` so adapters stay swappable.
 */
export interface McpDownstreamClient {
	/** List the tools the downstream source exposes. */
	listTools(): Promise<{ tools: DownstreamTool[] }>;
	/** Invoke one downstream tool by its ORIGINAL (un-prefixed) name. */
	callTool(params: {
		name: string;
		arguments?: Record<string, unknown>;
	}): Promise<unknown>;
	/** Release any resources/transport held by this client. */
	close(): Promise<void>;
}

/** A connected source in the pool, keyed by slug. */
export interface PooledAgentSource {
	source: ResolvedAgentSource;
	client: McpDownstreamClient;
}

/**
 * Builds an `McpDownstreamClient` for one resolved source given an org-scoped
 * MCP context. Pure factory — no global state — so the pool can inject a mock
 * in tests. Errors thrown here are caught per-source by the pool so one bad
 * source never blocks the others.
 */
export type AgentSourceConnector = (
	source: ResolvedAgentSource,
	ctx: McpContext,
) => Promise<McpDownstreamClient>;

/**
 * Resolve the active (`status: "active"`) agent sources for the context's
 * organization via the tRPC `agentSource.list` projection. Credentials are NOT
 * included — the list projection deliberately omits `encryptedConfig`.
 */
export async function resolveActiveAgentSources(
	ctx: McpContext,
): Promise<ResolvedAgentSource[]> {
	// Lazy import: the tRPC AppRouter caller pulls in the full app graph (env
	// validation, etc.). Keeping it dynamic means importing the pool/proxy
	// modules stays side-effect-free and unit-testable with an injected resolver.
	const { createMcpCaller } = await import("./caller");
	const caller = createMcpCaller(ctx);
	const rows = await caller.agentSource.list({
		organizationId: ctx.organizationId,
	});
	return rows
		.filter((row) => row.status === "active")
		.map((row) => ({
			id: row.id,
			slug: row.slug,
			kind: row.kind,
			endpointUrl: row.endpointUrl,
			integrationConnectionId: row.integrationConnectionId,
		}));
}

/** Local/rox-native source kinds served by the in-memory `rox-v2` server. */
const IN_MEMORY_KINDS = new Set<string>(["rox", "rox_v2"]);
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const RESTRICTED_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

function normalizeHostname(hostname: string): string {
	return hostname
		.trim()
		.toLowerCase()
		.replace(/^\[/, "")
		.replace(/\]$/, "")
		.replace(/\.$/, "");
}

function parseIpv4(address: string): number[] | null {
	const parts = address.split(".");
	if (parts.length !== 4) return null;
	const octets = parts.map((part) => Number(part));
	if (
		octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
	) {
		return null;
	}
	return octets;
}

function isRestrictedIpv4(address: string): boolean {
	const octets = parseIpv4(address);
	if (!octets) return true;
	const a = octets[0] ?? 0;
	const b = octets[1] ?? 0;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 0) ||
		(a === 192 && b === 168) ||
		(a === 198 && (b === 18 || b === 19)) ||
		a >= 224
	);
}

function firstIpv6Hextet(address: string): number {
	const [first = "0"] = address.split(":");
	return Number.parseInt(first || "0", 16);
}

function isRestrictedIpv6(address: string): boolean {
	const normalized = address.toLowerCase();
	const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mappedIpv4?.[1]) {
		return isRestrictedIpv4(mappedIpv4[1]);
	}
	if (normalized === "::" || normalized === "::1") return true;
	const first = firstIpv6Hextet(normalized);
	return (
		(first & 0xfe00) === 0xfc00 ||
		(first & 0xffc0) === 0xfe80 ||
		(first & 0xff00) === 0xff00 ||
		normalized.startsWith("100:") ||
		normalized.startsWith("2001:db8:")
	);
}

export function isRestrictedEndpointAddress(address: string): boolean {
	const normalized = normalizeHostname(address);
	const family = isIP(normalized);
	if (family === 4) return isRestrictedIpv4(normalized);
	if (family === 6) return isRestrictedIpv6(normalized);
	return true;
}

async function resolveEndpointAddresses(hostname: string): Promise<string[]> {
	const normalized = normalizeHostname(hostname);
	if (isIP(normalized)) return [normalized];
	const addresses = await lookup(normalized, { all: true, verbatim: true });
	return addresses.map((entry) => entry.address);
}

export async function validateExternalEndpointUrl(
	endpointUrl: string,
): Promise<URL> {
	const url = new URL(endpointUrl);
	if (url.protocol !== "https:") {
		throw new Error("External agent source endpoint must use HTTPS");
	}

	const hostname = normalizeHostname(url.hostname);
	if (RESTRICTED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
		throw new Error("External agent source endpoint host is restricted");
	}

	let addresses: string[];
	try {
		addresses = await resolveEndpointAddresses(hostname);
	} catch (error) {
		throw new Error(
			`External agent source endpoint host could not be resolved: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}

	const restrictedAddress = addresses.find(isRestrictedEndpointAddress);
	if (restrictedAddress) {
		throw new Error(
			`External agent source endpoint resolved to restricted address ${restrictedAddress}`,
		);
	}

	return url;
}

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	message: string,
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

/**
 * Adapter over the SDK `Client` so a connected MCP client satisfies the slim
 * `McpDownstreamClient` interface. Shared by the in-memory and (future) HTTP
 * transports.
 */
function adaptSdkClient(
	client: Client,
	transportClose: () => Promise<void>,
): McpDownstreamClient {
	return {
		async listTools() {
			const result = await client.listTools();
			return {
				tools: result.tools.map((tool) => ({
					name: tool.name,
					description: tool.description,
					inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
				})),
			};
		},
		async callTool(params) {
			return client.callTool({
				name: params.name,
				arguments: params.arguments,
			});
		},
		async close() {
			await transportClose();
		},
	};
}

/**
 * Real in-memory downstream adapter for local/`rox-v2` sources: spins an
 * in-process `rox-v2` MCP server and connects an SDK client to it over an
 * `InMemoryTransport`, wiring the same org-scoped `authInfo.extra.mcpContext`
 * the HTTP path uses. No network. Mirrors `createInMemoryMcpClient` but exposes
 * the slim downstream interface.
 */
export async function createInMemoryDownstreamClient(
	ctx: McpContext,
	onToolCall?: McpToolCallEmitter,
): Promise<McpDownstreamClient> {
	// Lazy import avoids a static cycle with `server.ts` (which imports this
	// module for `createProxyMcpServer`) and keeps this module side-effect-free
	// to import.
	const { createMcpServer } = await import("./server");
	const server = createMcpServer({ onToolCall });
	const [serverTransport, clientTransport] =
		InMemoryTransport.createLinkedPair();

	const originalSend = clientTransport.send.bind(clientTransport);
	clientTransport.send = (message, options) =>
		originalSend(message, {
			...options,
			authInfo: {
				token: "internal",
				clientId: "mcp-v2-proxy",
				scopes: ["mcp:full"],
				extra: { mcpContext: ctx },
			},
		});

	await server.connect(serverTransport);
	const client = new Client({ name: "rox-v2-proxy", version: "1.0.0" });
	await client.connect(clientTransport);

	return adaptSdkClient(client, async () => {
		await client.close();
		await server.close();
	});
}

/**
 * External-transport connector for `mcp` / `external_http` sources: connects an
 * SDK client to the source's `endpointUrl` over Streamable HTTP, injecting the
 * decrypted credential map as HTTP headers — so a source stores e.g.
 * `{ Authorization: "Bearer …" }` or `{ "X-API-Key": "…" }`. Credentials are
 * read server-side only through an org-scoped runtime path, never via the
 * `list` projection or a user/admin UI procedure. Throws on a missing endpoint,
 * rejected SSRF guard, or failed connect so the pool isolates this source
 * rather than failing the others.
 */
export async function createExternalDownstreamClient(
	source: ResolvedAgentSource,
	ctx: McpContext,
): Promise<McpDownstreamClient> {
	if (!source.endpointUrl) {
		throw new Error(
			`External agent source "${source.slug}" (kind: ${source.kind}) has no endpointUrl`,
		);
	}

	const endpointUrl = await validateExternalEndpointUrl(source.endpointUrl);
	const credentials = await loadRuntimeAgentSourceCredentials(source, ctx);

	const transport = new StreamableHTTPClientTransport(endpointUrl, {
		requestInit: {
			...(credentials ? { headers: credentials } : {}),
			redirect: "error",
		},
	});
	const client = new Client({ name: "rox-v2-proxy", version: "1.0.0" });
	await client.connect(transport);

	return adaptSdkClient(client, async () => {
		await client.close();
	});
}

export async function loadRuntimeAgentSourceCredentials(
	source: ResolvedAgentSource,
	ctx: McpContext,
): Promise<Record<string, string> | null> {
	const [row] = await db
		.select({ encryptedConfig: agentSources.encryptedConfig })
		.from(agentSources)
		.where(
			and(
				eq(agentSources.id, source.id),
				eq(agentSources.organizationId, ctx.organizationId),
				eq(agentSources.status, "active"),
			),
		)
		.limit(1);

	if (!row) {
		throw new Error(
			`Active agent source "${source.slug}" was not found in this organization`,
		);
	}
	if (!row.encryptedConfig) {
		return null;
	}

	return JSON.parse(decryptSecret(row.encryptedConfig)) as Record<
		string,
		string
	>;
}

/**
 * Default connector: chooses the in-memory adapter for local/`rox-v2` sources
 * and the external adapter for `mcp` / `external_http`. Callers may inject their
 * own connector (e.g. a mock) to keep the pool network-free in tests.
 */
export function defaultAgentSourceConnector(
	onToolCall?: McpToolCallEmitter,
): AgentSourceConnector {
	return async (source, ctx) => {
		if (IN_MEMORY_KINDS.has(source.kind)) {
			return createInMemoryDownstreamClient(ctx, onToolCall);
		}
		return createExternalDownstreamClient(source, ctx);
	};
}

export interface AgentSourcePoolOptions {
	/** Resolves active sources for the context org. Override in tests. */
	resolveSources?: (ctx: McpContext) => Promise<ResolvedAgentSource[]>;
	/** Builds a downstream client per source. Override in tests with a mock. */
	connector?: AgentSourceConnector;
	/** Maximum time spent connecting one source before moving to the next one. */
	connectTimeoutMs?: number;
}

/**
 * A lazily-connected pool of MCP downstream clients keyed by source slug. One
 * connection per source; failures to connect one source are isolated and
 * reported in `getFailures()` so the proxy can register the healthy sources and
 * skip the rest. `cleanup()` closes every connected client.
 */
export class AgentSourcePool {
	private readonly clients = new Map<string, PooledAgentSource>();
	private readonly failures = new Map<string, Error>();
	private readonly resolveSources: (
		ctx: McpContext,
	) => Promise<ResolvedAgentSource[]>;
	private readonly connector: AgentSourceConnector;
	private readonly connectTimeoutMs: number;

	constructor(options: AgentSourcePoolOptions = {}) {
		this.resolveSources = options.resolveSources ?? resolveActiveAgentSources;
		this.connector = options.connector ?? defaultAgentSourceConnector();
		this.connectTimeoutMs =
			options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
	}

	/**
	 * Resolve active sources for the context and lazily connect each one. A
	 * source that fails to connect is recorded in `getFailures()` and omitted
	 * from `getConnected()` — it never blocks the others. Idempotent: an
	 * already-connected slug is reused.
	 */
	async connectAll(ctx: McpContext): Promise<PooledAgentSource[]> {
		const sources = await this.resolveSources(ctx);
		for (const source of sources) {
			if (this.clients.has(source.slug)) continue;
			try {
				const client = await withTimeout(
					this.connector(source, ctx),
					this.connectTimeoutMs,
					`Agent source "${source.slug}" connection timed out after ${this.connectTimeoutMs}ms`,
				);
				this.clients.set(source.slug, { source, client });
				this.failures.delete(source.slug);
			} catch (error) {
				this.failures.set(
					source.slug,
					error instanceof Error ? error : new Error(String(error)),
				);
			}
		}
		return this.getConnected();
	}

	/** All successfully connected sources. */
	getConnected(): PooledAgentSource[] {
		return [...this.clients.values()];
	}

	/** Look up a connected client by slug. */
	get(slug: string): McpDownstreamClient | undefined {
		return this.clients.get(slug)?.client;
	}

	/** Per-source connection failures, keyed by slug. */
	getFailures(): Map<string, Error> {
		return new Map(this.failures);
	}

	/** Close every connected client. Safe to call multiple times. */
	async cleanup(): Promise<void> {
		const pooled = [...this.clients.values()];
		this.clients.clear();
		this.failures.clear();
		await Promise.all(
			pooled.map(async ({ client }) => {
				try {
					await client.close();
				} catch (error) {
					console.error("[mcp-v2] downstream client close failed:", error);
				}
			}),
		);
	}
}
