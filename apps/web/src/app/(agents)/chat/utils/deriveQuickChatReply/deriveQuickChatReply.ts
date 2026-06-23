import { ROX_CHAT_MODEL_NAME } from "@rox/shared/chat-models";
import type { ChatCompleteOutput } from "@rox/trpc";

/** Shown when a non-house model is picked but no user provider key is set. */
export const NEEDS_USER_KEY_NOTICE = `Для этой модели нужен ваш ключ провайдера. Откройте «Настройки → Модели», чтобы добавить ключ, либо выберите ${ROX_CHAT_MODEL_NAME} — она работает без настройки.`;
/** Shown when the Rox house model itself is not configured server-side. */
export const NOT_CONFIGURED_NOTICE =
	"Модель пока недоступна. Попробуйте позже или обратитесь к администратору.";
/** Shown when the request throws (network / server error). */
export const GENERIC_ERROR_NOTICE =
	"Не удалось получить ответ. Проверьте соединение и попробуйте снова.";

/**
 * Map a chat.complete result (or a null result from a thrown request) to the
 * assistant text to display. Pure; shared by the web quick chat. Mirrors the
 * desktop QuickChatView status handling so behavior stays identical.
 */
export function deriveQuickChatReply(
	result: ChatCompleteOutput | null,
): string {
	if (!result) return GENERIC_ERROR_NOTICE;
	switch (result.status) {
		case "ok":
			return result.reply;
		case "needs-user-key":
			return NEEDS_USER_KEY_NOTICE;
		default:
			return NOT_CONFIGURED_NOTICE;
	}
}
