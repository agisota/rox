/** Reasoning effort levels shown in the Quick Chat composer (RU UI). */
export const REASONING_LEVELS = [
	"Выкл",
	"Низкий",
	"Средний",
	"Высокий",
	"Макс",
] as const;

export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

export const DEFAULT_REASONING_LEVEL: ReasoningLevel = "Средний";
