import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	createProxyMcpServer,
	isMcpUnauthorized,
	type McpContext,
	resolveMcpContext,
} from "@rox/mcp-v2";
import { env } from "@/env";
import { posthog } from "@/lib/analytics";
import { getOAuthProtectedResourceMetadataUrl } from "@/lib/oauth-metadata";
import { getRelayUrl } from "@/lib/relay-url";

// Matches the `agent_sources.id` UUID shape (same constraint the host
// `agents.run` zod input applies to `sourceId`). A non-UUID query value is
// ignored so a scoped run silently degrades to the org-wide default.
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unauthorizedResponse(req: Request, message: string): Response {
	return new Response(
		JSON.stringify({ error: { code: "UNAUTHORIZED", message } }),
		{
			status: 401,
			headers: {
				"WWW-Authenticate": `Bearer realm="rox", resource_metadata="${getOAuthProtectedResourceMetadataUrl(req)}"`,
				"Content-Type": "application/json",
			},
		},
	);
}

async function handle(req: Request): Promise<Response> {
	let ctx: McpContext;
	try {
		ctx = await resolveMcpContext(req, {
			apiUrl: env.NEXT_PUBLIC_API_URL,
			relayUrl: env.RELAY_URL,
		});
	} catch (error) {
		if (isMcpUnauthorized(error)) {
			return unauthorizedResponse(req, error.message);
		}
		throw error;
	}

	ctx.relayUrl = await getRelayUrl(ctx.userId);

	// Run-scoping: an agent may reach the proxy with `?sourceId=<uuid>` to attach
	// ONLY that one active source instead of the org's whole active set. The MCP
	// JSON-RPC payload rides the request BODY, so reading the query string here is
	// orthogonal to `transport.handleRequest` below. A malformed/absent value is
	// ignored (left undefined) so the org-wide default and existing sourceless
	// callers are untouched; `createProxyMcpServer` consumes `ctx.sourceId` via
	// `AgentSourcePool.connectSelected`.
	const sourceIdParam = new URL(req.url).searchParams.get("sourceId");
	if (sourceIdParam && UUID_PATTERN.test(sourceIdParam)) {
		ctx.sourceId = sourceIdParam;
	}

	const { server, cleanup } = await createProxyMcpServer(ctx, {
		onToolCall: (event) => {
			posthog.capture({
				distinctId: event.userId,
				event: "mcp_tool_called",
				properties: {
					tool: event.toolName,
					organization_id: event.organizationId,
					auth_source: event.source,
					client_label: event.clientLabel,
					duration_ms: event.durationMs,
					success: event.success,
					error_message: event.errorMessage,
					mcp_server: "rox-v2",
					mcp_server_version: "0.1.0",
				},
				groups: { organization: event.organizationId },
			});
		},
	});
	const transport = new WebStandardStreamableHTTPServerTransport();
	await server.connect(transport);

	try {
		return await transport.handleRequest(req, {
			authInfo: {
				token: ctx.bearerToken,
				clientId: ctx.source === "api-key" ? "api-key" : "oauth",
				scopes: ["mcp:full"],
				extra: { mcpContext: ctx },
			},
		});
	} finally {
		// Close pooled downstream connections (and the proxy server) after the
		// single stateless JSON-RPC message has been handled and its response
		// produced. For orgs with no active agent sources this is a near no-op.
		try {
			await cleanup();
		} catch (error) {
			console.error("[mcp-v2] proxy cleanup failed:", error);
		}
	}
}

// Vercel hobby plan caps serverless maxDuration at 300s.
export const maxDuration = 300;

export { handle as GET, handle as POST, handle as DELETE };
