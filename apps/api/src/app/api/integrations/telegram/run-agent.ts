import Anthropic from "@anthropic-ai/sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { McpContext } from "@rox/mcp/auth";
import { createInMemoryMcpClient } from "@rox/mcp/in-memory";
import { env } from "@/env";
import { posthog } from "@/lib/analytics";
import {
	getErrorMessage,
	mcpToolToAnthropicTool,
	runMcpAgentLoop,
} from "../_shared/mcp-agent-loop";
import { DEFAULT_TELEGRAM_MODEL } from "./constants";

export interface TelegramAgentAction {
	type: string;
}

export interface TelegramAgentResult {
	text: string;
	actions: TelegramAgentAction[];
}

interface RunTelegramAgentParams {
	prompt: string;
	organizationId: string;
	userId: string;
	model?: string;
	onProgress?: (status: string) => void | Promise<void>;
}

const DENIED_ROX_TOOLS = new Set([
	"switch_workspace",
	"get_app_context",
	"list_members",
	"list_task_statuses",
	"list_devices",
]);

const TOOL_PROGRESS_STATUS: Record<string, string> = {
	create_task: "Creating task...",
	update_task: "Updating task...",
	delete_task: "Deleting task...",
	list_tasks: "Searching tasks...",
	get_task: "Fetching task details...",
	create_workspace: "Creating workspace...",
	list_workspaces: "Fetching workspaces...",
	list_projects: "Fetching projects...",
};

const SYSTEM_PROMPT = `You are a helpful assistant in Telegram for Rox, a platform for managing tasks and running coding agents in workspaces.

You can:
- Create, update, search, and manage tasks using rox_* tools
- Spawn workspaces and launch coding agents to do the work using rox_* tools
- Search the web for current information using web_search

Guidelines:
- Be concise and clear; Telegram messages should be short
- Default to taking action when intent is clear
- If an action fails, explain what went wrong and suggest the next concrete step
- Use plain Markdown-friendly text, not Slack-specific formatting
- Cite sources when sharing information from web search results`;

async function createTelegramMcpClient({
	organizationId,
	userId,
}: {
	organizationId: string;
	userId: string;
}): Promise<{ client: Client; cleanup: () => Promise<void> }> {
	return createInMemoryMcpClient({
		organizationId,
		userId,
		source: "telegram",
		onToolCall: (toolName: string, ctx: McpContext) => {
			posthog.capture({
				distinctId: ctx.userId,
				event: "mcp_tool_called",
				properties: {
					tool_name: toolName,
					source: ctx.source,
					org_id: ctx.organizationId,
				},
			});
		},
	});
}

async function fetchAgentContext({
	mcpClient,
	userId,
}: {
	mcpClient: Client;
	userId: string;
}): Promise<string> {
	const [membersResult, statusesResult, devicesResult] = await Promise.all([
		mcpClient.callTool({ name: "list_members", arguments: {} }),
		mcpClient.callTool({ name: "list_task_statuses", arguments: {} }),
		mcpClient.callTool({ name: "list_devices", arguments: {} }),
	]);

	const sections: string[] = [];

	const membersData = membersResult.structuredContent as {
		members: { id: string; name: string | null; email: string }[];
	} | null;
	if (membersData?.members?.length) {
		const currentUser = membersData.members.find((m) => m.id === userId);
		if (currentUser) {
			sections.push(
				`Current user: ${currentUser.name ?? currentUser.email} (id: ${currentUser.id}, email: ${currentUser.email})`,
			);
		}

		const lines = membersData.members.map(
			(m) => `- ${m.name ?? m.email} (id: ${m.id}, email: ${m.email})`,
		);
		sections.push(`Team members:\n${lines.join("\n")}`);
	}

	const statusesData = statusesResult.structuredContent as {
		statuses: { id: string; name: string; type: string }[];
	} | null;
	if (statusesData?.statuses?.length) {
		const lines = statusesData.statuses.map(
			(s) => `- ${s.name} (id: ${s.id}, type: ${s.type})`,
		);
		sections.push(`Task statuses:\n${lines.join("\n")}`);
	}

	const devicesData = devicesResult.structuredContent as {
		devices: {
			deviceId: string;
			deviceName: string | null;
			ownerName: string | null;
			ownerEmail: string;
		}[];
	} | null;
	if (devicesData?.devices?.length) {
		const lines = devicesData.devices.map(
			(d) =>
				`- ${d.deviceName ?? "Unknown"} (id: ${d.deviceId}, owner: ${d.ownerName ?? d.ownerEmail})`,
		);
		sections.push(`Devices:\n${lines.join("\n")}`);
	}

	return sections.join("\n\n");
}

export function formatActionsForTelegram(
	actions: TelegramAgentAction[],
): string {
	if (actions.length === 0) return "";
	return `Changes:\n${actions.map((action) => `- ${action.type}`).join("\n")}`;
}

export async function formatErrorForTelegram(error: unknown): Promise<string> {
	const message = getErrorMessage(error);
	if (/rate limit|overload|temporarily|timeout/i.test(message)) {
		return "The model provider is temporarily unavailable. Please try again in a moment.";
	}
	return "Sorry, I couldn't complete that. Please try again.";
}

export async function runTelegramAgent(
	params: RunTelegramAgentParams,
): Promise<TelegramAgentResult> {
	const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
	const actions: TelegramAgentAction[] = [];
	let roxMcp: Client | null = null;
	let cleanupRox: (() => Promise<void>) | null = null;

	try {
		const roxMcpResult = await createTelegramMcpClient({
			organizationId: params.organizationId,
			userId: params.userId,
		});
		roxMcp = roxMcpResult.client;
		cleanupRox = roxMcpResult.cleanup;

		// These readonly context tools are denied to model-initiated calls below,
		// but the agent prefetches them once to give the model safe task context.
		const [roxToolsResult, agentContext] = await Promise.all([
			roxMcp.listTools(),
			fetchAgentContext({ mcpClient: roxMcp, userId: params.userId }),
		]);

		const roxTools = roxToolsResult.tools
			.filter((t) => !DENIED_ROX_TOOLS.has(t.name))
			.map((t) => mcpToolToAnthropicTool(t, "rox"));

		const tools: Anthropic.Messages.ToolUnion[] = [
			...roxTools,
			{
				type: "web_search_20250305" as const,
				name: "web_search" as const,
				max_uses: 3,
			},
		];

		const system = `${SYSTEM_PROMPT}

Current context:
- Organization ID: ${params.organizationId}

${agentContext}`;

		const messages: Anthropic.MessageParam[] = [
			{ role: "user", content: params.prompt },
		];

		const text = await runMcpAgentLoop({
			anthropic,
			roxMcp,
			model: params.model ?? DEFAULT_TELEGRAM_MODEL,
			system,
			tools,
			messages,
			progressStatus: TOOL_PROGRESS_STATUS,
			logTag: "telegram-agent",
			onProgress: params.onProgress,
			onRoxToolResult: (toolName) => {
				actions.push({ type: toolName });
			},
			onToolLimit: (lastText) => {
				const prefix = lastText?.trim();
				const limitMessage =
					"I stopped after reaching the Telegram agent tool limit. Please narrow the request or ask me to continue with a smaller step.";
				return prefix ? `${prefix}\n\n${limitMessage}` : limitMessage;
			},
		});

		return { text, actions };
	} finally {
		if (cleanupRox) {
			try {
				await cleanupRox();
			} catch {}
		}
	}
}
