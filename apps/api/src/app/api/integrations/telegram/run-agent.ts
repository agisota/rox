import Anthropic from "@anthropic-ai/sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { McpContext } from "@rox/mcp/auth";
import { createInMemoryMcpClient } from "@rox/mcp/in-memory";
import { env } from "@/env";
import { posthog } from "@/lib/analytics";
import { DEFAULT_TELEGRAM_MODEL } from "./constants";

interface McpTool {
	name: string;
	description?: string;
	inputSchema: unknown;
}

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

function mcpToolToAnthropicTool(tool: McpTool, prefix: string): Anthropic.Tool {
	return {
		name: `${prefix}_${tool.name}`,
		description: tool.description ?? "",
		input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
	};
}

function parseToolName(prefixedName: string): {
	prefix: string;
	toolName: string;
} {
	const underscoreIndex = prefixedName.indexOf("_");
	if (underscoreIndex === -1) {
		return { prefix: prefixedName, toolName: "" };
	}
	const prefix = prefixedName.slice(0, underscoreIndex);
	const toolName = prefixedName.slice(underscoreIndex + 1);
	return { prefix, toolName };
}

function stripServerToolBlocks(
	content: Anthropic.ContentBlock[],
): Anthropic.ContentBlockParam[] {
	return content.filter(
		(block) =>
			block.type !== "web_search_tool_result" &&
			block.type !== "server_tool_use",
	) as unknown as Anthropic.ContentBlockParam[];
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
	const message = error instanceof Error ? error.message : String(error);
	try {
		const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
		const response = await anthropic.messages.create({
			model: "claude-haiku-4-5",
			max_tokens: 192,
			messages: [
				{
					role: "user",
					content: `Rewrite this API error as a brief, friendly Telegram message (1 sentence). No JSON.\n\nError: ${message}`,
				},
			],
		});
		const text = response.content.find(
			(b): b is Anthropic.TextBlock => b.type === "text",
		);
		return text?.text ?? "Sorry, something went wrong. Please try again.";
	} catch {
		return "Sorry, something went wrong. Please try again.";
	}
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

		let response = await anthropic.messages.create({
			model: params.model ?? DEFAULT_TELEGRAM_MODEL,
			max_tokens: 2048,
			system,
			tools,
			messages,
		});

		const MAX_TOOL_ITERATIONS = 10;
		let iterations = 0;

		while (
			(response.stop_reason === "tool_use" ||
				response.stop_reason === "pause_turn") &&
			iterations < MAX_TOOL_ITERATIONS
		) {
			iterations++;

			if (response.stop_reason === "pause_turn") {
				await params.onProgress?.("Searching the web...");
				messages.push({ role: "assistant", content: response.content });
				response = await anthropic.messages.create({
					model: params.model ?? DEFAULT_TELEGRAM_MODEL,
					max_tokens: 2048,
					system,
					tools,
					messages,
				});
				continue;
			}

			const toolUseBlocks = response.content.filter(
				(b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
			);
			const toolResults: Anthropic.ToolResultBlockParam[] = [];

			for (const toolUse of toolUseBlocks) {
				try {
					const { prefix, toolName } = parseToolName(toolUse.name);
					const progressStatus =
						TOOL_PROGRESS_STATUS[toolUse.name] ??
						TOOL_PROGRESS_STATUS[toolName] ??
						"Working...";
					await params.onProgress?.(progressStatus);

					if (prefix !== "rox" || !roxMcp) {
						toolResults.push({
							type: "tool_result",
							tool_use_id: toolUse.id,
							content: JSON.stringify({
								error: `Unknown tool: ${toolUse.name}`,
							}),
							is_error: true,
						});
						continue;
					}

					const result = await roxMcp.callTool({
						name: toolName,
						arguments: toolUse.input as Record<string, unknown>,
					});

					actions.push({ type: toolName });
					toolResults.push({
						type: "tool_result",
						tool_use_id: toolUse.id,
						content: JSON.stringify(result.content),
					});
				} catch (error) {
					console.error("[telegram-agent] Tool execution error:", error);
					toolResults.push({
						type: "tool_result",
						tool_use_id: toolUse.id,
						content: JSON.stringify({
							error:
								error instanceof Error
									? error.message
									: "Tool execution failed",
						}),
						is_error: true,
					});
				}
			}

			messages.push({
				role: "assistant",
				content: stripServerToolBlocks(response.content),
			});
			messages.push({ role: "user", content: toolResults });

			response = await anthropic.messages.create({
				model: params.model ?? DEFAULT_TELEGRAM_MODEL,
				max_tokens: 2048,
				system,
				tools,
				messages,
			});
		}

		const textBlocks = response.content.filter(
			(b): b is Anthropic.TextBlock => b.type === "text",
		);
		const textBlock = textBlocks.at(-1);

		return {
			text: textBlock?.text ?? "Done!",
			actions,
		};
	} finally {
		if (cleanupRox) {
			try {
				await cleanupRox();
			} catch {}
		}
	}
}
