/**
 * Pure, deterministic presentation helpers for the mail surface (ported from
 * the web inbox `messagePreview` / `formatMailParticipant`). No network, no
 * React — unit-friendly and shared across the list, reader, and composer.
 */

const MAX_PREVIEW = 120;

/**
 * Collapse a body/snippet into a single-line preview for the thread list.
 * Strips runs of whitespace and clamps length so a long first message can't
 * blow out the row height.
 */
export function messagePreview(
	body: string | null | undefined,
	max = MAX_PREVIEW,
): string {
	const flat = (body ?? "").replace(/\s+/g, " ").trim();
	if (flat.length <= max) return flat;
	return `${flat.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Friendly sender label: prefer the display name, fall back to the bare
 * address, finally a neutral RU placeholder for a malformed envelope.
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

/** First-letter avatar seed for a sender (uppercased letter/digit or "•"). */
export function mailParticipantInitial(label: string): string {
	const ch = label.trim().charAt(0).toUpperCase();
	return /[A-ZА-Я0-9]/.test(ch) ? ch : "•";
}

/** Compact absolute date+time for a message header. */
export function formatDateTime(
	value: Date | string | null | undefined,
): string {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString([], {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * Relative-ish list timestamp: time-of-day for today, otherwise a short date.
 * Mirrors the web `MailThreadListItem.formatListTime`.
 */
export function formatListTime(
	value: Date | string | null | undefined,
): string {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const now = new Date();
	const sameDay = date.toDateString() === now.toDateString();
	return sameDay
		? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
		: date.toLocaleDateString([], { day: "2-digit", month: "short" });
}

/** Human-readable byte size for an attachment row. */
export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
