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
		await cleanup();
	}
}

// Vercel hobby plan caps serverless maxDuration at 300s.
export const maxDuration = 300;

export { handle as GET, handle as POST, handle as DELETE };
