import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { auth } from "@rox/auth/server";
import { createMcpServer } from "@rox/mcp";
import { verifyAccessToken } from "better-auth/oauth2";
import { env } from "@/env";
import { handleMcpRequest, type McpRequestDeps } from "./auth-flow";

const deps: McpRequestDeps = {
	apiUrl: env.NEXT_PUBLIC_API_URL,
	authApi: auth.api,
	createServer: createMcpServer,
	createTransport: () => new WebStandardStreamableHTTPServerTransport(),
	verifyAccessToken,
};

async function handleRequest(req: Request): Promise<Response> {
	return handleMcpRequest(req, deps);
}

// Hobby plan caps serverless maxDuration at 300s (raise to 800 on Pro/Enterprise).
export const maxDuration = 300;

export { handleRequest as GET, handleRequest as POST, handleRequest as DELETE };
