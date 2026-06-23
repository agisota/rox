/**
 * Whether the dictation mic may start recording right now.
 * `disabled` folds in "voice not configured"; `transcribing` is the in-flight
 * transcription of the previous clip. Either one blocks a new recording.
 */
export function canStartDictation(
	disabled: boolean | undefined,
	transcribing: boolean | undefined,
): boolean {
	return !disabled && !transcribing;
}
