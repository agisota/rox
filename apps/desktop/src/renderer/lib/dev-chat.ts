import { AVAILABLE_CHAT_MODELS } from "@rox/shared/chat-models";
import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";
import { env } from "renderer/env.renderer";
import { MOCK_ORG_ID } from "shared/constants";

export const DEV_CHAT_MODELS: ModelOption[] = [...AVAILABLE_CHAT_MODELS];

export function isDesktopChatDevMode(
	skipEnvValidation = env.SKIP_ENV_VALIDATION,
): boolean {
	return skipEnvValidation;
}

export function resolveDesktopChatOrganizationId(
	activeOrganizationId: string | null | undefined,
	skipEnvValidation = env.SKIP_ENV_VALIDATION,
): string | null {
	if (skipEnvValidation) return MOCK_ORG_ID;
	return activeOrganizationId ?? null;
}

export function isDesktopChatSessionReady({
	sessionId,
	hasPersistedSession,
	skipEnvValidation = env.SKIP_ENV_VALIDATION,
}: {
	sessionId: string | null;
	hasPersistedSession: boolean;
	skipEnvValidation?: boolean;
}): boolean {
	if (skipEnvValidation) return Boolean(sessionId);
	return hasPersistedSession;
}

export function getDesktopChatModelOptions(
	skipEnvValidation = env.SKIP_ENV_VALIDATION,
): ModelOption[] {
	return skipEnvValidation ? DEV_CHAT_MODELS : [];
}
