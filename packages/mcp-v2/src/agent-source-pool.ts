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
	signal?: AbortSignal,
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

/**
 * Resolve ONE active agent source for the context org by its `sourceId`. This is
 * the run-scoping counterpart of {@link resolveActiveAgentSources}: a run that
 * the composer scoped to a single chosen source (the composer's
 * `selectedSourceId`) attaches exactly that source instead of the whole org's
 * active set. Returns `null` when the id is unknown, belongs to another org, or
 * is not currently `active` — the caller treats that as "nothing to attach"
 * rather than an error, so a stale/archived selection silently degrades to a
 * sourceless run instead of failing the launch.
 *
 * Like {@link resolveActiveAgentSources} this rides the credential-free
 * `agentSource.list` projection (no `encryptedConfig`); credentials are still
 * loaded later, server-side only, through {@link loadRuntimeAgentSourceCredentials}
 * when a real downstream transport connects.
 */
export async function resolveSelectedAgentSource(
	ctx: McpContext,
	sourceId: string,
): Promise<ResolvedAgentSource | null> {
	const active = await resolveActiveAgentSources(ctx);
	return active.find((source) => source.id === sourceId) ?? null;
}

/** Local/rox-native source kinds served by the in-memory `rox-v2` server. */
const IN_MEMORY_KINDS = new Set<string>(["rox", "rox_v2"]);
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_CONNECT_MAX_ATTEMPTS = 2;
const DEFAULT_CONNECT_RETRY_BASE_DELAY_MS = 150;
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

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new Error("Agent source connection aborted");
	}
}

function isRetriableConnectionError(error: Error): boolean {
	return !(
		error.message.includes("must use HTTPS") ||
		error.message.includes("host is restricted") ||
		error.message.includes("resolved to restricted address") ||
		error.message.includes("has no endpointUrl") ||
		error.message.includes("was not found in this organization")
	);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T extends { close?: () => Promise<void> }>(
	executor: (signal: AbortSignal) => Promise<T>,
	timeoutMs: number,
	message: string,
): Promise<T> {
	const controller = new AbortController();
	let didTimeout = false;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const operation = executor(controller.signal).then(async (value) => {
		if (didTimeout) {
			try {
				await value.close?.();
			} catch {
				// Best effort: the caller has already recorded the timeout failure.
			}
		}
		return value;
	});
	operation.catch(() => undefined);

	try {
		return await Promise.race([
			operation,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => {
					didTimeout = true;
					controller.abort();
					reject(new Error(message));
				}, timeoutMs);
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
	signal?: AbortSignal,
): Promise<McpDownstreamClient> {
	throwIfAborted(signal);
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
	throwIfAborted(signal);
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
	signal?: AbortSignal,
): Promise<McpDownstreamClient> {
	if (!source.endpointUrl) {
		throw new Error(
			`External agent source "${source.slug}" (kind: ${source.kind}) has no endpointUrl`,
		);
	}

	const endpointUrl = await validateExternalEndpointUrl(source.endpointUrl);
	throwIfAborted(signal);
	const credentials = await loadRuntimeAgentSourceCredentials(source, ctx);
	throwIfAborted(signal);

	const transport = new StreamableHTTPClientTransport(endpointUrl, {
		requestInit: {
			...(credentials ? { headers: credentials } : {}),
			redirect: "error",
			signal,
		},
	});
	const client = new Client({ name: "rox-v2-proxy", version: "1.0.0" });
	throwIfAborted(signal);
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
	return async (source, ctx, signal) => {
		if (IN_MEMORY_KINDS.has(source.kind)) {
			return createInMemoryDownstreamClient(ctx, onToolCall, signal);
		}
		return createExternalDownstreamClient(source, ctx, signal);
	};
}

export interface AgentSourcePoolOptions {
	/** Resolves active sources for the context org. Override in tests. */
	resolveSources?: (ctx: McpContext) => Promise<ResolvedAgentSource[]>;
	/** Builds a downstream client per source. Override in tests with a mock. */
	connector?: AgentSourceConnector;
	/** Maximum time spent connecting one source before moving to the next one. */
	connectTimeoutMs?: number;
	/** Bounded attempts for transient downstream connection failures. */
	connectMaxAttempts?: number;
	/** Base retry delay; exponential backoff doubles this per retry. */
	connectRetryBaseDelayMs?: number;
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
	private readonly connectMaxAttempts: number;
	private readonly connectRetryBaseDelayMs: number;

	constructor(options: AgentSourcePoolOptions = {}) {
		this.resolveSources = options.resolveSources ?? resolveActiveAgentSources;
		this.connector = options.connector ?? defaultAgentSourceConnector();
		this.connectTimeoutMs =
			options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
		this.connectMaxAttempts = Math.max(
			1,
			options.connectMaxAttempts ?? DEFAULT_CONNECT_MAX_ATTEMPTS,
		);
		this.connectRetryBaseDelayMs = Math.max(
			0,
			options.connectRetryBaseDelayMs ?? DEFAULT_CONNECT_RETRY_BASE_DELAY_MS,
		);
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
			await this.connectSource(source, ctx);
		}
		return this.getConnected();
	}

	/**
	 * Run-scoping connect: resolve the ONE active source the run selected (by
	 * `sourceId`) and connect only it, so a scoped run gets exactly that source's
	 * tools rather than the whole org's active set ({@link connectAll}).
	 *
	 * The production consumer is {@link import("./server").createProxyMcpServer},
	 * which calls this (instead of `connectAll`) when `ctx.sourceId` is set — i.e.
	 * when the agent's MCP request to the cloud rox-v2 proxy carries `?sourceId=`.
	 * See `server.run-scoping.test.ts` for the consumer-level proof.
	 *
	 * Reuses the same per-source connect/retry/isolation path as `connectAll`
	 * (via {@link connectSource}). When the id resolves to nothing active
	 * (unknown / cross-org / not `active`), nothing is connected and the caller
	 * proceeds sourcelessly — a stale selection never fails the launch. A
	 * downstream connection failure is isolated into `getFailures()` exactly like
	 * `connectAll`. Idempotent: an already-connected slug is reused.
	 */
	async connectSelected(
		ctx: McpContext,
		sourceId: string,
	): Promise<PooledAgentSource | null> {
		const source = await resolveSelectedAgentSource(ctx, sourceId);
		if (!source) return null;
		await this.connectSource(source, ctx);
		return this.clients.get(source.slug) ?? null;
	}

	/**
	 * Connect a single resolved source into the pool with bounded retries and
	 * per-source failure isolation. Shared by {@link connectAll} and
	 * {@link connectSelected} so the retry/timeout/isolation policy lives in one
	 * place. Idempotent: an already-connected slug short-circuits.
	 */
	private async connectSource(
		source: ResolvedAgentSource,
		ctx: McpContext,
	): Promise<void> {
		if (this.clients.has(source.slug)) return;
		try {
			let client: McpDownstreamClient | undefined;
			let lastError: Error | undefined;
			for (let attempt = 1; attempt <= this.connectMaxAttempts; attempt++) {
				try {
					client = await withTimeout(
						(signal) => this.connector(source, ctx, signal),
						this.connectTimeoutMs,
						`Agent source "${source.slug}" connection timed out after ${this.connectTimeoutMs}ms`,
					);
					break;
				} catch (error) {
					lastError = toError(error);
					if (
						attempt < this.connectMaxAttempts &&
						isRetriableConnectionError(lastError)
					) {
						await delay(
							this.connectRetryBaseDelayMs * 2 ** Math.max(0, attempt - 1),
						);
						continue;
					}
					break;
				}
			}
			if (!client) throw lastError ?? new Error("Agent source connect failed");
			this.clients.set(source.slug, { source, client });
			this.failures.delete(source.slug);
		} catch (error) {
			this.failures.set(source.slug, toError(error));
		}
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
