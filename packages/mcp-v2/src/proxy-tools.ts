import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
	DownstreamTool,
	McpDownstreamClient,
	PooledAgentSource,
} from "./agent-source-pool";
import { defineTool } from "./define-tool";

/** Tool-name namespace separator: `mcp__{slug}__{tool}`. */
const PREFIX = "mcp__";
const SEP = "__";

/**
 * Build the namespaced proxy tool name for a downstream tool.
 *
 *   namespacedToolName("github", "create_issue") === "mcp__github__create_issue"
 */
export function namespacedToolName(slug: string, toolName: string): string {
	return `${PREFIX}${slug}${SEP}${toolName}`;
}

/**
 * Recover the ORIGINAL downstream tool name from a namespaced proxy name for a
 * given slug. Returns `null` when `name` is not in this slug's namespace, so a
 * handler never forwards a foreign or malformed name.
 *
 *   stripToolNamePrefix("github", "mcp__github__create_issue") === "create_issue"
 */
export function stripToolNamePrefix(slug: string, name: string): string | null {
	const expected = `${PREFIX}${slug}${SEP}`;
	if (!name.startsWith(expected)) return null;
	const original = name.slice(expected.length);
	return original.length > 0 ? original : null;
}

/**
 * Passthrough input schema for proxied tools. Downstream argument shapes are
 * only known at runtime (from `listTools`), so the proxy accepts any object and
 * forwards it verbatim; the downstream source performs the real validation.
 */
const passthroughInputSchema = z.looseObject({});

function validateProxyToolNames(slug: string, tools: DownstreamTool[]): void {
	const seen = new Set<string>();
	for (const tool of tools) {
		if (!tool.name.trim()) {
			throw new Error(`Source "${slug}" exposed a tool with an empty name`);
		}
		const namespaced = namespacedToolName(slug, tool.name);
		if (seen.has(namespaced)) {
			throw new Error(
				`Source "${slug}" exposed duplicate tool name "${tool.name}"`,
			);
		}
		seen.add(namespaced);
	}
}

/**
 * Register every tool of one pooled source onto `server` under the
 * `mcp__{slug}__{tool}` namespace. Each handler strips the prefix and forwards
 * the call to the pooled downstream client using the ORIGINAL tool name.
 * Telemetry is emitted automatically by `defineTool` under the namespaced name.
 *
 * Returns the list of registered (namespaced) tool names. Throwing here is the
 * caller's signal to skip this source — see {@link registerProxyTools}, which
 * isolates per-source failures.
 */
export async function registerProxySourceTools(
	server: McpServer,
	pooled: PooledAgentSource,
): Promise<string[]> {
	const { source, client } = pooled;
	const { tools } = await client.listTools();
	validateProxyToolNames(source.slug, tools);
	const registered: string[] = [];
	for (const tool of tools) {
		registerProxyTool(server, source.slug, tool, client);
		registered.push(namespacedToolName(source.slug, tool.name));
	}
	return registered;
}

/** Register a single proxied tool. */
function registerProxyTool(
	server: McpServer,
	slug: string,
	tool: DownstreamTool,
	client: McpDownstreamClient,
): void {
	defineTool(server, {
		name: namespacedToolName(slug, tool.name),
		description:
			tool.description ?? `Proxied "${tool.name}" tool from source "${slug}".`,
		rawInputSchema: passthroughInputSchema,
		handler: async (input) => {
			const original = stripToolNamePrefix(
				slug,
				namespacedToolName(slug, tool.name),
			);
			if (!original) {
				throw new Error(
					`Could not resolve downstream tool name for "${tool.name}" on source "${slug}"`,
				);
			}
			return client.callTool({
				name: original,
				arguments: input as Record<string, unknown>,
			});
		},
	});
}

/** Outcome of registering proxy tools across a pool of sources. */
export interface ProxyRegistrationResult {
	/** All namespaced tool names registered, across every healthy source. */
	registered: string[];
	/** Per-source registration failures, keyed by slug — never aborts others. */
	failures: Map<string, Error>;
}

/**
 * Register proxy tools for every connected source in `pooled`. A source whose
 * `listTools()`/registration throws is recorded in `failures` and skipped — it
 * never blocks registration of the remaining sources (per-source isolation).
 */
export async function registerProxyTools(
	server: McpServer,
	pooled: PooledAgentSource[],
): Promise<ProxyRegistrationResult> {
	const registered: string[] = [];
	const failures = new Map<string, Error>();
	for (const entry of pooled) {
		try {
			const names = await registerProxySourceTools(server, entry);
			registered.push(...names);
		} catch (error) {
			failures.set(
				entry.source.slug,
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}
	return { registered, failures };
}

/**
 * Name of the synthetic, informational tool registered when one or more
 * downstream sources fail to connect/list. It carries NO credentials — only
 * the source `slug` and the connection error message — so a client can SEE a
 * degraded source instead of silently missing its tools.
 */
export const DEGRADED_SOURCES_TOOL_NAME = "mcp__proxy_degraded";

/** Public shape of a single degraded-source entry surfaced to the client. */
export interface DegradedSourceInfo {
	/** The org-configured source slug whose tools could not be exposed. */
	slug: string;
	/** Human-readable connection/list error (never includes credentials). */
	message: string;
}

/**
 * T7 — graceful, observable degradation. When `failures` is non-empty, register
 * ONE synthetic informational tool ({@link DEGRADED_SOURCES_TOOL_NAME}) so a
 * client's `tools/list` reveals which downstream sources are unavailable rather
 * than silently omitting their tools. This is purely additive: when there are
 * no failures nothing is registered and healthy paths are completely unchanged.
 *
 * The marker leaks no secrets — only the source slug + the (already
 * client-safe) connection error message, mirroring `result.failures`. Returns
 * `true` when the notice was registered, `false` when there was nothing to note.
 */
export function registerDegradedSourcesNotice(
	server: McpServer,
	failures: Map<string, Error>,
): boolean {
	if (failures.size === 0) {
		return false;
	}

	const degraded: DegradedSourceInfo[] = [...failures.entries()].map(
		([slug, error]) => ({ slug, message: error.message }),
	);
	const slugList = degraded.map((d) => d.slug).join(", ");

	defineTool(server, {
		name: DEGRADED_SOURCES_TOOL_NAME,
		description:
			`Informational: ${degraded.length} downstream MCP source(s) are ` +
			`currently unavailable and their tools are NOT exposed: ${slugList}. ` +
			"Call this tool for the per-source connection error details. No action " +
			"is performed; healthy sources and native tools are unaffected.",
		rawInputSchema: passthroughInputSchema,
		handler: async () => ({
			degraded,
			count: degraded.length,
		}),
	});

	return true;
}
