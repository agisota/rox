import type Anthropic from "@anthropic-ai/sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { logger } from "@/lib/logger";

/**
 * Shared Anthropic tool-loop orchestration for chat integrations (Slack,
 * Telegram, ...). The per-channel differences — system prompt, tool list,
 * message sink, action recording, retry policy, extra client-side tools, and
 * the tool-limit message — are parameterized; the channel modules keep only
 * their thin glue (context assembly + result formatting).
 */

interface McpTool {
	name: string;
	description?: string;
	inputSchema: unknown;
}

/** Max client-side tool-execution iterations before the loop bails out. */
export const MAX_TOOL_ITERATIONS = 10;

/** Anthropic call retry policy (used by {@link createAnthropicMessage}). */
export const MAX_ANTHROPIC_ATTEMPTS = 3;
export const ANTHROPIC_RETRY_BASE_MS = 250;

export function mcpToolToAnthropicTool(
	tool: McpTool,
	prefix: string,
): Anthropic.Tool {
	return {
		name: `${prefix}_${tool.name}`,
		description: tool.description ?? "",
		input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
	};
}

export function parseToolName(prefixedName: string): {
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

/**
 * Strip server-side web search content blocks (search results + tool
 * invocations) from assistant messages to prevent context bloat in subsequent
 * API calls. The text blocks already contain the synthesized answer with
 * citations, so the raw search results aren't needed for tool execution.
 */
export function stripServerToolBlocks(
	content: Anthropic.ContentBlock[],
): Anthropic.ContentBlockParam[] {
	return content.filter(
		(block) =>
			block.type !== "web_search_tool_result" &&
			block.type !== "server_tool_use",
	) as unknown as Anthropic.ContentBlockParam[];
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatus(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null) return undefined;
	const status = (error as { status?: unknown }).status;
	return typeof status === "number" ? status : undefined;
}

export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function isRetryableAnthropicError(error: unknown): boolean {
	const status = getErrorStatus(error);
	if (
		status === 408 ||
		status === 409 ||
		status === 429 ||
		(status !== undefined && status >= 500 && status < 600)
	) {
		return true;
	}
	return /timeout|network|econnreset|econnrefused|temporarily|overload|rate limit/i.test(
		getErrorMessage(error),
	);
}

/**
 * Create an Anthropic message with bounded exponential-backoff retry on
 * transient failures (timeouts, 429s, 5xx, overload). On success this is a
 * single passthrough call, so it is safe to use on any channel without
 * changing observable success behavior.
 */
export async function createAnthropicMessage(
	anthropic: Anthropic,
	params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
	for (let attempt = 1; attempt <= MAX_ANTHROPIC_ATTEMPTS; attempt++) {
		try {
			return await anthropic.messages.create(params);
		} catch (error) {
			if (
				attempt >= MAX_ANTHROPIC_ATTEMPTS ||
				!isRetryableAnthropicError(error)
			) {
				throw error;
			}
			await delay(ANTHROPIC_RETRY_BASE_MS * 2 ** (attempt - 1));
		}
	}
	throw new Error("Anthropic request failed after retries");
}

/** Result of a channel-specific client-side tool handled before the rox MCP. */
export interface ClientToolResult {
	content: string;
	isError?: boolean;
}

export interface RunMcpAgentLoopParams {
	anthropic: Anthropic;
	/** Rox MCP client used to execute `rox_*` tools. */
	roxMcp: Client | null;
	model: string;
	system: string;
	tools: Anthropic.Messages.ToolUnion[];
	/** Seed conversation; mutated in place across iterations. */
	messages: Anthropic.MessageParam[];
	/** Tool name (prefixed or raw) -> human progress string. */
	progressStatus: Record<string, string>;
	/** Log tag, e.g. "slack-agent" / "telegram-agent". */
	logTag: string;
	onProgress?: (status: string) => void | Promise<void>;
	/**
	 * Handle a non-rox client-side tool (e.g. slack_get_channel_history).
	 * Return `null`/`undefined` to fall through to the rox MCP path.
	 */
	executeClientTool?: (
		toolUse: Anthropic.ToolUseBlock,
	) => Promise<ClientToolResult | null | undefined>;
	/**
	 * Record a channel action from a successful rox tool result and/or perform
	 * channel-specific bookkeeping. Called once per executed rox tool.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: MCP result varies by tool
	onRoxToolResult?: (toolName: string, result: any) => void;
	/**
	 * Build the final reply when the loop stops because it hit
	 * MAX_TOOL_ITERATIONS. Receives the last assistant text (if any). When
	 * omitted, the last text block is returned as-is (no special message).
	 */
	onToolLimit?: (lastText: string | undefined) => string;
}

/**
 * Drive the Anthropic tool-use loop to completion and return the final
 * assistant text. Mutates `params.messages` as the conversation progresses.
 */
export async function runMcpAgentLoop(
	params: RunMcpAgentLoopParams,
): Promise<string> {
	const {
		anthropic,
		roxMcp,
		model,
		system,
		tools,
		messages,
		progressStatus,
		logTag,
		onProgress,
		executeClientTool,
		onRoxToolResult,
		onToolLimit,
	} = params;

	const reportProgress = async (status: string): Promise<void> => {
		try {
			await onProgress?.(status);
		} catch {
			// Non-critical: never fail the agent because a progress update failed.
		}
	};

	let response = await createAnthropicMessage(anthropic, {
		model,
		max_tokens: 2048,
		system,
		tools,
		messages,
	});

	let iterations = 0;

	while (
		(response.stop_reason === "tool_use" ||
			response.stop_reason === "pause_turn") &&
		iterations < MAX_TOOL_ITERATIONS
	) {
		iterations++;

		// pause_turn: server-side tool (web search) paused a long-running turn.
		if (response.stop_reason === "pause_turn") {
			await reportProgress("Searching the web...");
			messages.push({ role: "assistant", content: response.content });
			response = await createAnthropicMessage(anthropic, {
				model,
				max_tokens: 2048,
				system,
				tools,
				messages,
			});
			continue;
		}

		// tool_use: handle client-side tools (channel tools + rox MCP).
		const toolUseBlocks = response.content.filter(
			(b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
		);

		const toolResults: Anthropic.ToolResultBlockParam[] = [];

		for (const toolUse of toolUseBlocks) {
			try {
				const { prefix, toolName: rawToolName } = parseToolName(toolUse.name);
				const progress =
					progressStatus[toolUse.name] ??
					progressStatus[rawToolName] ??
					"Working...";
				await reportProgress(progress);

				const clientResult = await executeClientTool?.(toolUse);
				if (clientResult) {
					toolResults.push({
						type: "tool_result",
						tool_use_id: toolUse.id,
						content: clientResult.content,
						...(clientResult.isError ? { is_error: true } : {}),
					});
					continue;
				}

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
					name: rawToolName,
					arguments: toolUse.input as Record<string, unknown>,
				});

				onRoxToolResult?.(rawToolName, result);

				toolResults.push({
					type: "tool_result",
					tool_use_id: toolUse.id,
					content: JSON.stringify(result.content),
				});
			} catch (error) {
				logger.error(`[${logTag}] Tool execution error:`, toolUse.name, error);
				toolResults.push({
					type: "tool_result",
					tool_use_id: toolUse.id,
					content: JSON.stringify({
						error:
							error instanceof Error ? error.message : "Tool execution failed",
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

		response = await createAnthropicMessage(anthropic, {
			model,
			max_tokens: 2048,
			system,
			tools,
			messages,
		});
	}

	// Use the last text block — server-side tools like web_search produce
	// multiple text blocks (preamble + synthesis) and we want the final one.
	const textBlocks = response.content.filter(
		(b): b is Anthropic.TextBlock => b.type === "text",
	);
	const lastText = textBlocks.at(-1)?.text;

	const stoppedAtToolLimit =
		(response.stop_reason === "tool_use" ||
			response.stop_reason === "pause_turn") &&
		iterations >= MAX_TOOL_ITERATIONS;

	if (stoppedAtToolLimit && onToolLimit) {
		return onToolLimit(lastText);
	}

	return lastText ?? "Done!";
}
