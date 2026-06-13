import { z } from "zod";
import {
	AGENT_NATIVE_EMBED_MESSAGE_TYPES,
	type AgentNativeEmbedEnvelope,
	createAgentNativeEmbedEnvelope,
	isAgentNativeEmbedEnvelope,
} from "../protocol";

/**
 * Envelope `name` for renderer → host context publications
 * (`type: "message"`).
 */
export const CONTEXT_MESSAGE_NAME = "rox.screen-context" as const;

/**
 * Hard cap on user-selected text carried in a context packet. Selection is
 * the only free-form field in the packet; everything else is structural.
 */
export const MAX_SELECTION_TEXT_LENGTH = 2_000;

const MAX_ROUTE_LENGTH = 2_048;

const routeContextSchema = z
	.object({
		pathname: z.string().min(1).max(MAX_ROUTE_LENGTH),
		params: z.record(z.string(), z.string()).optional(),
	})
	.strict();

const selectionContextSchema = z
	.object({
		text: z.string().min(1).max(MAX_SELECTION_TEXT_LENGTH),
		truncated: z.boolean().optional(),
	})
	.strict();

/**
 * The screen-context whitelist. `.strict()` everywhere: a packet is rejected
 * outright if it carries any field outside this shape, so renderer bugs (or
 * future fields added without review) cannot leak env vars, tokens, or other
 * page state to agents.
 */
export const contextPacketSchema = z
	.object({
		workspaceId: z.string().min(1),
		route: routeContextSchema,
		selection: selectionContextSchema.optional(),
		capturedAt: z.number().int().nonnegative(),
	})
	.strict();

export type ContextPacket = z.infer<typeof contextPacketSchema>;
export type RouteContext = z.infer<typeof routeContextSchema>;
export type SelectionContext = z.infer<typeof selectionContextSchema>;

export interface ContextPacketDraft {
	workspaceId: string;
	route: RouteContext;
	selectionText?: string | null;
	capturedAt?: number;
}

/**
 * Build a whitelisted packet from raw renderer state. Drops empty selection
 * and truncates oversized selection text instead of failing.
 */
export function buildContextPacket(draft: ContextPacketDraft): ContextPacket {
	const trimmed = draft.selectionText?.trim() ?? "";
	const selection: SelectionContext | undefined =
		trimmed.length > 0
			? trimmed.length > MAX_SELECTION_TEXT_LENGTH
				? {
						text: trimmed.slice(0, MAX_SELECTION_TEXT_LENGTH),
						truncated: true,
					}
				: { text: trimmed }
			: undefined;

	return contextPacketSchema.parse({
		workspaceId: draft.workspaceId,
		route: draft.route,
		...(selection ? { selection } : {}),
		capturedAt: draft.capturedAt ?? Date.now(),
	});
}

export function createContextEnvelope(
	packet: ContextPacket,
): AgentNativeEmbedEnvelope<ContextPacket> {
	return createAgentNativeEmbedEnvelope(
		AGENT_NATIVE_EMBED_MESSAGE_TYPES.MESSAGE,
		{
			name: CONTEXT_MESSAGE_NAME,
			payload: packet,
		},
	);
}

export type ParseContextResult =
	| { ok: true; packet: ContextPacket }
	| { ok: false; error: string };

export function parseContextEnvelope(value: unknown): ParseContextResult {
	if (!isAgentNativeEmbedEnvelope(value)) {
		return { ok: false, error: "not an agent-native.embed v1 envelope" };
	}
	if (
		value.type !== AGENT_NATIVE_EMBED_MESSAGE_TYPES.MESSAGE ||
		value.name !== CONTEXT_MESSAGE_NAME
	) {
		return {
			ok: false,
			error: `expected ${AGENT_NATIVE_EMBED_MESSAGE_TYPES.MESSAGE}/${CONTEXT_MESSAGE_NAME}, got ${value.type}/${value.name ?? "<unnamed>"}`,
		};
	}
	const parsed = contextPacketSchema.safeParse(value.payload);
	if (!parsed.success) {
		return {
			ok: false,
			error: `invalid context packet: ${parsed.error.message}`,
		};
	}
	return { ok: true, packet: parsed.data };
}
