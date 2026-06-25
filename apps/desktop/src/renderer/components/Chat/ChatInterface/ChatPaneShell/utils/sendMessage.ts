/**
 * Shared send-failure + session-resolution helpers for the unified
 * ChatPaneShell. Canonical copy of the per-tree `sendMessage` utils.
 *
 * `ChatSendMessageInput` itself lives in `ChatPaneShell.types.ts` (the shared
 * turn shape both wrappers feed in); this module owns the backend-independent
 * error-classification (`toSendFailureMessage`) and the create→ensure session
 * ladder (`sendMessageForSession`) that the legacy tree drives through its
 * `SessionLifecycleAdapter`.
 *
 * Error copy is RU-localized to match the canonical (richer) v2 shell and the
 * RU-localized product.
 */

import type { StartFreshSessionResult } from "renderer/components/Chat/ChatInterface/types";

const SESSION_CREATE_ERROR_MESSAGE =
	"Не удалось создать сессию чата. Повторите попытку.";
const SESSION_PERSIST_ERROR_MESSAGE =
	"Сессия чата не инициализировалась. Подождите немного и повторите.";

function toBaseErrorMessage(error: unknown): string {
	if (typeof error === "string" && error.trim().length > 0) return error;
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	return "Не удалось отправить сообщение";
}

function toNumericStatus(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string") return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

function getErrorStatusCode(error: unknown): number | null {
	if (!error || typeof error !== "object") return null;
	const candidate = error as {
		status?: unknown;
		statusCode?: unknown;
		code?: unknown;
		data?: { status?: unknown; statusCode?: unknown };
		response?: {
			status?: unknown;
			data?: { status?: unknown; statusCode?: unknown };
		};
	};
	const statusCandidates = [
		candidate.status,
		candidate.statusCode,
		candidate.response?.status,
		candidate.data?.status,
		candidate.data?.statusCode,
		candidate.response?.data?.status,
		candidate.response?.data?.statusCode,
		candidate.code,
	];
	for (const statusCandidate of statusCandidates) {
		const parsed = toNumericStatus(statusCandidate);
		if (parsed !== null) return parsed;
	}
	return null;
}

export function toSendFailureMessage(error: unknown): string {
	const baseMessage = toBaseErrorMessage(error);
	const statusCode = getErrorStatusCode(error);
	if (statusCode !== 401 && statusCode !== 403) return baseMessage;
	return "Ошибка аутентификации модели. Переподключите OAuth или укажите API-ключ в пикере моделей и повторите.";
}

export async function sendMessageForSession<T>({
	currentSessionId,
	isSessionReady,
	ensureSessionReady,
	onStartFreshSession,
	sendToCurrentSession,
	sendToSession,
}: {
	currentSessionId: string | null;
	isSessionReady: boolean;
	ensureSessionReady: () => Promise<boolean>;
	onStartFreshSession: () => Promise<StartFreshSessionResult>;
	sendToCurrentSession: () => Promise<T>;
	sendToSession: (sessionId: string) => Promise<T>;
}): Promise<{ targetSessionId: string; value: T }> {
	let targetSessionId = currentSessionId;

	if (!targetSessionId) {
		const startResult = await onStartFreshSession();
		if (!startResult.created || !startResult.sessionId) {
			throw new Error(startResult.errorMessage ?? SESSION_CREATE_ERROR_MESSAGE);
		}
		targetSessionId = startResult.sessionId;
	}

	if (
		currentSessionId &&
		targetSessionId === currentSessionId &&
		!isSessionReady
	) {
		const ensured = await ensureSessionReady();
		if (!ensured) throw new Error(SESSION_PERSIST_ERROR_MESSAGE);
	}

	const value =
		currentSessionId && targetSessionId === currentSessionId
			? await sendToCurrentSession()
			: await sendToSession(targetSessionId);

	return { targetSessionId, value };
}
