import { z } from "zod";

/**
 * Wire format for all agent-bridge messages: the `agent-native.embed` v1
 * envelope from BuilderIO's agent-native Embedding SDK
 * (https://www.agent-native.com/docs/embedding-sdk,
 * `@agent-native/embedding/protocol`).
 *
 * `@agent-native/embedding` is documented as an npm package but is not
 * published to the registry yet (`bun add @agent-native/embedding` → 404),
 * so this module is an independent, wire-compatible implementation of the
 * documented v1 protocol surface. Once the package ships, these exports can
 * be swapped for the upstream ones without changing any bytes on the wire —
 * which keeps slice 2 (EmbeddedApp iframe surfaces) and slice 3 (A2A) on the
 * same envelope.
 */
export const AGENT_NATIVE_EMBED_PROTOCOL = "agent-native.embed" as const;
export const AGENT_NATIVE_EMBED_VERSION = 1 as const;

export const AGENT_NATIVE_EMBED_MESSAGE_TYPES = {
	READY: "ready",
	MESSAGE: "message",
	REQUEST: "request",
	RESPONSE: "response",
	ERROR: "error",
} as const;

export type AgentNativeEmbedMessageType =
	(typeof AGENT_NATIVE_EMBED_MESSAGE_TYPES)[keyof typeof AGENT_NATIVE_EMBED_MESSAGE_TYPES];

const embedErrorPayloadSchema = z.object({
	message: z.string(),
	code: z.string().optional(),
});

export type AgentNativeEmbedErrorPayload = z.infer<
	typeof embedErrorPayloadSchema
>;

export const agentNativeEmbedEnvelopeSchema = z.object({
	protocol: z.literal(AGENT_NATIVE_EMBED_PROTOCOL),
	version: z.literal(AGENT_NATIVE_EMBED_VERSION),
	type: z.enum([
		AGENT_NATIVE_EMBED_MESSAGE_TYPES.READY,
		AGENT_NATIVE_EMBED_MESSAGE_TYPES.MESSAGE,
		AGENT_NATIVE_EMBED_MESSAGE_TYPES.REQUEST,
		AGENT_NATIVE_EMBED_MESSAGE_TYPES.RESPONSE,
		AGENT_NATIVE_EMBED_MESSAGE_TYPES.ERROR,
	]),
	name: z.string().optional(),
	payload: z.unknown().optional(),
	requestId: z.string().optional(),
	error: embedErrorPayloadSchema.optional(),
});

export interface AgentNativeEmbedEnvelope<TPayload = unknown> {
	protocol: typeof AGENT_NATIVE_EMBED_PROTOCOL;
	version: typeof AGENT_NATIVE_EMBED_VERSION;
	type: AgentNativeEmbedMessageType;
	name?: string;
	payload?: TPayload;
	requestId?: string;
	error?: AgentNativeEmbedErrorPayload;
}

export function isAgentNativeEmbedEnvelope(
	value: unknown,
): value is AgentNativeEmbedEnvelope {
	return agentNativeEmbedEnvelopeSchema.safeParse(value).success;
}

export function createAgentNativeEmbedEnvelope<TPayload>(
	type: AgentNativeEmbedMessageType,
	options: {
		name?: string;
		payload?: TPayload;
		requestId?: string;
		error?: AgentNativeEmbedErrorPayload;
	} = {},
): AgentNativeEmbedEnvelope<TPayload> {
	return {
		protocol: AGENT_NATIVE_EMBED_PROTOCOL,
		version: AGENT_NATIVE_EMBED_VERSION,
		type,
		...options,
	};
}

export function createEmbedRequestId(): string {
	return `embed-${crypto.randomUUID()}`;
}
