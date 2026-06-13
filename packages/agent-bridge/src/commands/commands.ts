import { z } from "zod";
import {
	AGENT_NATIVE_EMBED_MESSAGE_TYPES,
	type AgentNativeEmbedEnvelope,
	createAgentNativeEmbedEnvelope,
	createEmbedRequestId,
	isAgentNativeEmbedEnvelope,
} from "../protocol";

/**
 * Envelope `name` for host → renderer UI commands (`type: "request"`) and
 * renderer → host acks (`type: "response"`).
 */
export const UI_COMMAND_REQUEST_NAME = "rox.ui-command" as const;

const MAX_ROUTE_LENGTH = 2_048;

/**
 * Explicit allow-list of UI commands. Anything not in this union is rejected
 * before it reaches the renderer. `openFile` / `refreshData` are planned for
 * slice 2 and must be added here (plus a renderer handler) to ship.
 */
export const UI_COMMAND_KINDS = ["navigate"] as const;
export type UiCommandKind = (typeof UI_COMMAND_KINDS)[number];

const navigateCommandSchema = z
	.object({
		kind: z.literal("navigate"),
		route: z
			.string()
			.min(1)
			.max(MAX_ROUTE_LENGTH)
			.startsWith("/", "route must be an absolute in-app path"),
	})
	.strict();

export const uiCommandSchema = z.discriminatedUnion("kind", [
	navigateCommandSchema,
]);

export type UiCommand = z.infer<typeof uiCommandSchema>;
export type NavigateCommand = z.infer<typeof navigateCommandSchema>;

export const uiCommandResultSchema = z
	.object({
		ok: z.boolean(),
		error: z.string().max(2_000).optional(),
	})
	.strict();

export type UiCommandResult = z.infer<typeof uiCommandResultSchema>;

export function createUiCommandEnvelope(
	command: UiCommand,
	requestId: string = createEmbedRequestId(),
): AgentNativeEmbedEnvelope<UiCommand> {
	return createAgentNativeEmbedEnvelope(
		AGENT_NATIVE_EMBED_MESSAGE_TYPES.REQUEST,
		{
			name: UI_COMMAND_REQUEST_NAME,
			payload: uiCommandSchema.parse(command),
			requestId,
		},
	);
}

export function createUiCommandAckEnvelope(
	requestId: string,
	result: UiCommandResult,
): AgentNativeEmbedEnvelope<UiCommandResult> {
	return createAgentNativeEmbedEnvelope(
		AGENT_NATIVE_EMBED_MESSAGE_TYPES.RESPONSE,
		{
			name: UI_COMMAND_REQUEST_NAME,
			payload: uiCommandResultSchema.parse(result),
			requestId,
			...(result.ok
				? {}
				: { error: { message: result.error ?? "command failed" } }),
		},
	);
}

export type ParseUiCommandResult =
	| { ok: true; command: UiCommand; requestId: string }
	| { ok: false; error: string };

export function parseUiCommandEnvelope(value: unknown): ParseUiCommandResult {
	if (!isAgentNativeEmbedEnvelope(value)) {
		return { ok: false, error: "not an agent-native.embed v1 envelope" };
	}
	if (
		value.type !== AGENT_NATIVE_EMBED_MESSAGE_TYPES.REQUEST ||
		value.name !== UI_COMMAND_REQUEST_NAME
	) {
		return {
			ok: false,
			error: `expected ${AGENT_NATIVE_EMBED_MESSAGE_TYPES.REQUEST}/${UI_COMMAND_REQUEST_NAME}, got ${value.type}/${value.name ?? "<unnamed>"}`,
		};
	}
	if (!value.requestId) {
		return { ok: false, error: "ui command request is missing requestId" };
	}
	const parsed = uiCommandSchema.safeParse(value.payload);
	if (!parsed.success) {
		return {
			ok: false,
			error: `command rejected by allow-list: ${parsed.error.message}`,
		};
	}
	return { ok: true, command: parsed.data, requestId: value.requestId };
}

export type ParseUiCommandAckResult =
	| { ok: true; requestId: string; result: UiCommandResult }
	| { ok: false; error: string };

export function parseUiCommandAckEnvelope(
	value: unknown,
): ParseUiCommandAckResult {
	if (!isAgentNativeEmbedEnvelope(value)) {
		return { ok: false, error: "not an agent-native.embed v1 envelope" };
	}
	if (
		value.type !== AGENT_NATIVE_EMBED_MESSAGE_TYPES.RESPONSE ||
		value.name !== UI_COMMAND_REQUEST_NAME
	) {
		return {
			ok: false,
			error: `expected ${AGENT_NATIVE_EMBED_MESSAGE_TYPES.RESPONSE}/${UI_COMMAND_REQUEST_NAME}, got ${value.type}/${value.name ?? "<unnamed>"}`,
		};
	}
	if (!value.requestId) {
		return { ok: false, error: "ui command ack is missing requestId" };
	}
	const parsed = uiCommandResultSchema.safeParse(value.payload);
	if (!parsed.success) {
		return { ok: false, error: `invalid ack payload: ${parsed.error.message}` };
	}
	return { ok: true, requestId: value.requestId, result: parsed.data };
}
