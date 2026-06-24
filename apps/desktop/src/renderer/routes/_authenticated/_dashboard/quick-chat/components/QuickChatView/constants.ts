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

/**
 * Single motion token set for Quick Chat. The easing matches the one the shared
 * `ConversationScrollButton` already uses (ai-elements/conversation.tsx) so the
 * surface speaks one motion language across web/desktop. Consumers must still
 * honor `useReducedMotion` and collapse these to opacity-only transitions.
 */
export const QUICK_CHAT_MOTION = {
	/** cubic-bezier shared with ConversationScrollButton's fade. */
	ease: [0.16, 1, 0.3, 1] as const,
	/** New-bubble enter / banner slide duration (seconds). */
	duration: 0.18,
} as const;

/**
 * Curated subset of `DEFAULT_SAVED_PROMPTS` ids surfaced as starter chips in the
 * Quick Chat empty state, so the blank composer offers a clickable kickoff. The
 * prompt bodies stay sourced from the saved-prompts list — this only picks which
 * ones to show — so both surfaces share one starter source of truth.
 */
export const STARTER_PROMPT_IDS = [
	"plan-day",
	"inbox-triage",
	"diff-bug-scan",
	"polish-draft",
	"explain-code",
	"research-digest",
] as const;
