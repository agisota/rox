/**
 * Some reasoning models (e.g. GPT-5.x at high effort) reject the `temperature`
 * sampling param the underlying mastracode/@mastra harness always sends, so the
 * provider answers `[400] Unsupported parameter: temperature`. That param is set
 * upstream and can't be stripped from the harness request here — surface a clear,
 * actionable message instead of the raw gateway error.
 */
function explainKnownChatError(raw: string): string {
	if (
		/temperature/i.test(raw) &&
		/unsupported|not supported|\b400\b/i.test(raw)
	) {
		return "Выбранная reasoning-модель не принимает параметр «temperature», который добавляет движок чата. Это ограничение провайдера модели, а не настроек Set — выберите другую модель (например, без расширенного reasoning).";
	}
	return raw;
}

export function getErrorMessage(error: unknown): string | null {
	if (error instanceof Error) return explainKnownChatError(error.message);
	if (typeof error === "string") return explainKnownChatError(error);
	if (error) return "Непредвиденная ошибка чата";
	return null;
}
