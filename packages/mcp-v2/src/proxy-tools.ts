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
