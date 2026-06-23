/**
 * Render a friendly sender label for an email message.
 *
 * Mail rows carry a raw `fromAddr` (always) and an optional `fromName`. The list
 * and message header prefer the display name when present, falling back to the
 * bare address, and finally to a neutral placeholder when neither is set (e.g. a
 * malformed inbound envelope). Pure + deterministic so it is unit-testable.
 */
export function formatMailParticipant(input: {
	fromAddr: string | null | undefined;
	fromName?: string | null;
}): string {
	const name = input.fromName?.trim();
	if (name) return name;
	const addr = input.fromAddr?.trim();
	if (addr) return addr;
	return "Неизвестный отправитель";
}

/** First-letter avatar seed for a sender (uppercased ASCII letter or "•"). */
export function mailParticipantInitial(label: string): string {
	const ch = label.trim().charAt(0).toUpperCase();
	return /[A-ZА-Я0-9]/.test(ch) ? ch : "•";
}
