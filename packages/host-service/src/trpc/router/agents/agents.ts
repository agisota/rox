import { readFileSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../db";
import { hostAgentConfigs } from "../../../db/schema";
import { logger } from "../../../lib/logger";
import { createTerminalSessionInternal } from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import { resolveAttachmentPath } from "../attachments/storage";
import { runAgentAndCapture } from "./agent-run-capture";

interface ResolvedHostAgentConfig {
	id: string;
	presetId: string;
	label: string;
	command: string;
	args: string[];
	promptTransport: "argv" | "stdin";
	promptArgs: string[];
	env: Record<string, string>;
}

function parseArgv(value: string): string[] {
	try {
		const parsed = JSON.parse(value);
		if (
			!Array.isArray(parsed) ||
			parsed.some((entry) => typeof entry !== "string")
		) {
			return [];
		}
		return parsed as string[];
	} catch {
		return [];
	}
}

function parseEnv(value: string): Record<string, string> {
	try {
		const parsed = JSON.parse(value);
		if (
			parsed === null ||
			typeof parsed !== "object" ||
			Array.isArray(parsed) ||
			Object.values(parsed).some((entry) => typeof entry !== "string")
		) {
			return {};
		}
		return parsed as Record<string, string>;
	} catch {
		return {};
	}
}

function rowToConfig(
	row: typeof hostAgentConfigs.$inferSelect,
): ResolvedHostAgentConfig {
	return {
		id: row.id,
		presetId: row.presetId,
		label: row.label,
		command: row.command,
		args: parseArgv(row.argsJson),
		promptTransport: row.promptTransport as "argv" | "stdin",
		promptArgs: parseArgv(row.promptArgsJson),
		env: parseEnv(row.envJson),
	};
}

/**
 * Look up a HostAgentConfig by its instance id first, then fall back to the
 * lowest-`order` row matching by presetId. Preset ids are short slugs;
 * instance ids are UUIDs — they don't collide.
 */
export function resolveHostAgentConfig(
	db: HostDb,
	agent: string,
): ResolvedHostAgentConfig | null {
	const byId = db
		.select()
		.from(hostAgentConfigs)
		.where(eq(hostAgentConfigs.id, agent))
		.get();
	if (byId) return rowToConfig(byId);

	const byPreset = db
		.select()
		.from(hostAgentConfigs)
		.where(eq(hostAgentConfigs.presetId, agent))
		.orderBy(asc(hostAgentConfigs.displayOrder))
		.get();
	if (byPreset) return rowToConfig(byPreset);

	return null;
}

function quoteSingleShell(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildArgvCommand(argv: string[]): string {
	return argv.map(quoteSingleShell).join(" ");
}

/**
 * Build a shell command string that runs the resolved agent config with the
 * given prompt. argv transport appends the prompt as the final positional;
 * stdin transport pipes the prompt via a heredoc so the agent can read from
 * fd 0.
 *
 * Empty prompts drop `promptArgs` so codex/opencode/copilot don't get stray
 * prompt-mode flags during promptless launches.
 */
export function buildAgentCommandString(
	config: ResolvedHostAgentConfig,
	prompt: string,
): string {
	const baseArgv = [config.command, ...config.args, ...config.promptArgs];

	if (config.promptTransport === "argv") {
		return buildArgvCommand([...baseArgv, prompt]);
	}

	// stdin: pipe the prompt to the spawned process via heredoc. Delimiter is
	// constructed to avoid collision with any line in the prompt content.
	const baseDelimiter = "ROX_PROMPT";
	let delimiter = baseDelimiter;
	let counter = 0;
	while (prompt.split("\n").some((line) => line === delimiter)) {
		counter += 1;
		delimiter = `${baseDelimiter}_${counter}`;
	}
	return `${buildArgvCommand(baseArgv)} <<'${delimiter}'\n${prompt}\n${delimiter}`;
}

function envOverlayPrefix(env: Record<string, string>): string {
	const entries = Object.entries(env);
	if (entries.length === 0) return "";
	const assignments = entries
		.map(([key, value]) => `${key}=${quoteSingleShell(value)}`)
		.join(" ");
	return `${assignments} `;
}

function buildAttachmentBlock(
	prompt: string,
	resolved: Array<{ attachmentId: string; path: string }>,
): string {
	if (resolved.length === 0) return prompt;
	const lines = resolved.map((item) => `- ${item.path}`);
	const block = `\n\n# Attached files\n\nThe user attached these files. They are available on this host at:\n\n${lines.join("\n")}`;
	return prompt + block;
}

export interface AgentRunInput {
	workspaceId: string;
	agent: string;
	prompt: string;
	maxTurns?: number;
	/**
	 * Effective model id for this run (pipeline NodeInspector override → role
	 * preset), transported from the cloud bridge (#527). For a chat agent the
	 * runtime switches to it for the turn (`metadata.model` → `engine.switchModel`);
	 * undefined preserves the workspace/runtime default model.
	 */
	model?: string;
	/**
	 * Effective sampling temperature for this run (#527). Validated + forwarded to
	 * the runtime where a temperature knob exists; undefined keeps the default.
	 */
	temperature?: number;
	attachmentIds?: string[];
	/**
	 * Optional Agent-Native source (`agent_sources.id`) the run is scoped to,
	 * forwarded from the composer's `selectedSourceId` through the host write
	 * seam. NOTE: the host run path does NOT consume this — chat runs disable MCP
	 * and terminal runs reach the rox-v2 proxy over a SEPARATE stateless HTTP
	 * request (auth = bearer only). The source-attach consumer is the cloud proxy
	 * (`createProxyMcpServer` -> `AgentSourcePool.connectSelected`), which scopes a
	 * run to this source only when the agent's MCP request carries `?sourceId=`.
	 * This field is accepted for forward-compat plumbing; it is validated and
	 * passed through but otherwise inert here. Additive: undefined preserves the
	 * prior sourceless behaviour.
	 */
	sourceId?: string;
}

export type AgentRunResult =
	| {
			kind: "terminal";
			sessionId: string;
			label: string;
			/** The exact shell command queued into the pty (incl. env overlay). The
			 * shell echoes this back before running it; the capture path strips that
			 * echoed line so it doesn't leak into the threaded output. */
			command: string;
	  }
	| { kind: "chat"; sessionId: string; label: string };

const ROX_AGENT_ID = "rox";
const ROX_AGENT_LABEL = "Rox";

async function resolveAttachmentsAsFiles(
	attachmentIds: string[],
): Promise<Array<{ data: string; mediaType: string; filename?: string }>> {
	return attachmentIds.map((attachmentId) => {
		const resolved = resolveAttachmentPath(attachmentId);
		if (!resolved) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `Attachment not found: ${attachmentId}`,
			});
		}
		const bytes = readFileSync(resolved.path);
		const data = `data:${resolved.metadata.mediaType};base64,${bytes.toString("base64")}`;
		return {
			data,
			mediaType: resolved.metadata.mediaType,
			...(resolved.metadata.originalFilename
				? { filename: resolved.metadata.originalFilename }
				: {}),
		};
	});
}

async function runChatAgent(
	ctx: HostServiceContext,
	input: AgentRunInput,
	label: string,
): Promise<AgentRunResult> {
	const sessionId = crypto.randomUUID();
	const files = await resolveAttachmentsAsFiles(input.attachmentIds ?? []);

	await ctx.api.chat.createSession.mutate({
		sessionId,
		v2WorkspaceId: input.workspaceId,
	});

	// Errors surface via `getSnapshot.displayState.errorMessage` when a
	// chat pane attaches.
	void ctx.runtime.chat
		.sendMessage({
			sessionId,
			workspaceId: input.workspaceId,
			payload: {
				content: input.prompt,
				...(files.length > 0 ? { files } : {}),
			},
			// Per-node model override (#527): the chat runtime switches to it for this
			// turn via `engine.switchModel`. Omitted ⇒ the runtime default model stands.
			...(input.model != null && input.model.trim() !== ""
				? { metadata: { model: input.model } }
				: {}),
		})
		.catch((error) => {
			logger.error(
				`[runChatAgent] sendMessage failed for ${sessionId}:`,
				error,
			);
		});

	return { kind: "chat", sessionId, label };
}

async function runTerminalAgent(
	ctx: { db: HostDb; eventBus: import("../../../events").EventBus },
	input: AgentRunInput,
): Promise<AgentRunResult> {
	const config = resolveHostAgentConfig(ctx.db, input.agent);
	if (!config) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `No host agent config matching '${input.agent}' (tried instance id then preset id).`,
		});
	}

	const resolvedAttachments: Array<{ attachmentId: string; path: string }> = [];
	for (const attachmentId of input.attachmentIds ?? []) {
		const resolved = resolveAttachmentPath(attachmentId);
		if (!resolved) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `Attachment not found: ${attachmentId}`,
			});
		}
		resolvedAttachments.push({ attachmentId, path: resolved.path });
	}

	const prompt = buildAttachmentBlock(input.prompt, resolvedAttachments);
	const command = buildAgentCommandString(config, prompt);
	const fullCommand = `${envOverlayPrefix(config.env)}${command}`;

	const terminalId = crypto.randomUUID();
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId: input.workspaceId,
		db: ctx.db,
		eventBus: ctx.eventBus,
		initialCommand: fullCommand,
	});

	if ("error" in result) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: result.error,
		});
	}

	return {
		kind: "terminal",
		sessionId: result.terminalId,
		label: config.label,
		command: fullCommand,
	};
}

export async function runAgentInWorkspace(
	ctx: HostServiceContext,
	input: AgentRunInput,
): Promise<AgentRunResult> {
	if (input.agent === ROX_AGENT_ID) {
		return runChatAgent(ctx, input, ROX_AGENT_LABEL);
	}
	return runTerminalAgent(ctx, input);
}

export const agentsRouter = router({
	run: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				agent: z.string().min(1),
				prompt: z.string().min(1),
				attachmentIds: z.array(z.string().uuid()).optional(),
				// Additive forward-channel for the composer-selected Agent-Native
				// source id (see AgentRunInput.sourceId — validated + passed through,
				// not consumed by the host run path). Optional UUID so existing
				// sourceless callers are unaffected.
				sourceId: z.string().uuid().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => runAgentInWorkspace(ctx, input)),

	/**
	 * Blocking variant of {@link agentsRouter.run} for Agent Pipelines: start the
	 * agent, wait for it to settle, and return its captured output so the cloud
	 * pipeline executor can thread it into the run's accumulating context. See
	 * `./agent-run-capture` (host side) and `agent-run-host-bridge` (cloud side).
	 */
	runAndCapture: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				agent: z.string().min(1),
				prompt: z.string().min(1),
				maxTurns: z.number().int().positive().max(200).default(8),
				// Per-node model/temperature transported from the pipeline run (#527).
				// `model` switches a chat agent's runtime model for the turn; both are
				// optional so existing callers (no override) are unaffected. Temperature
				// is bounded to the same [0, 2] range the NodeInspector clamps to.
				model: z.string().min(1).optional(),
				temperature: z.number().min(0).max(2).optional(),
				attachmentIds: z.array(z.string().uuid()).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => runAgentAndCapture(ctx, input)),
});
