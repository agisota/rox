/**
 * F39 — Single localization swap point for Activity-worklog chrome strings that
 * are NOT verb labels (those live in `@rox/chat/shared` `ACTIVITY_VERB_LABELS`).
 *
 * Until F58 i18n lands, route these RU strings through this one constant instead
 * of inline literals so localization is a one-file swap.
 */
export const ACTIVITY_LABELS = {
	/** Timeline header. */
	header: "Активность",
} as const;
