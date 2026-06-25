/**
 * Platform-agnostic, serializable core for the conversation outline /
 * scrollback rail (F49).
 *
 * The rail renders one marker per USER message. Two desktop call-sites feed it
 * two different message shapes (`@rox/chat/client` transcript messages and the
 * `ai` SDK `UIMessage`), and web/mobile will feed their own. To keep the
 * component reusable across platforms, derivation is expressed against a
 * minimal structural contract (`OutlineSourceMessage`) and produces a plain,
 * JSON-serializable `OutlineEntry[]`. Callers adapt their native message type
 * into the structural shape (it is satisfied structurally — no mapping needed
 * for the common cases) and pass the result to the presentational rail.
 */

/** 60-char excerpt budget for the outline preview (F49 spec). */
export const OUTLINE_PREVIEW_CHARACTER_LIMIT = 60;

/** A single text/file fragment of a message, matched structurally. */
export interface OutlineSourcePart {
	type: string;
	text?: string;
}

/** Minimal structural contract every supported message shape satisfies. */
export interface OutlineSourceMessage {
	id: string;
	role: string;
	/** `ai` SDK `UIMessage` exposes `parts`; transcript messages expose `content`. */
	parts?: readonly OutlineSourcePart[];
	content?: readonly OutlineSourcePart[];
}

/** A serializable outline row consumed by the rail. */
export interface OutlineEntry {
	id: string;
	preview: string;
	isLatest: boolean;
}

/** Optional locale-aware fallbacks for attachment-only / empty messages. */
export interface OutlineLabels {
	attachmentSingular: (count: number) => string;
	attachmentPlural: (count: number) => string;
	empty: string;
}

const DEFAULT_LABELS: OutlineLabels = {
	attachmentSingular: () => "Sent 1 attachment",
	attachmentPlural: (count) => `Sent ${count} attachments`,
	empty: "(empty message)",
};

/** Truncate to the 60-char budget with an ellipsis suffix. */
export function truncateOutlinePreview(text: string): string {
	if (text.length <= OUTLINE_PREVIEW_CHARACTER_LIMIT) {
		return text;
	}

	return `${text.slice(0, OUTLINE_PREVIEW_CHARACTER_LIMIT - 3)}...`;
}

function readParts(
	message: OutlineSourceMessage,
): readonly OutlineSourcePart[] {
	return message.parts ?? message.content ?? [];
}

/** Build a single message's outline preview (text first, then attachments). */
export function buildOutlinePreview(
	message: OutlineSourceMessage,
	labels: OutlineLabels = DEFAULT_LABELS,
): string {
	const parts = readParts(message);

	const textContent = parts
		.filter((part) => part.type === "text" && typeof part.text === "string")
		.map((part) => (part.text ?? "").trim())
		.filter(Boolean)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();

	if (textContent) {
		return truncateOutlinePreview(textContent);
	}

	const attachmentCount = parts.filter(
		(part) => part.type === "file" || part.type === "image",
	).length;
	if (attachmentCount > 0) {
		return attachmentCount === 1
			? labels.attachmentSingular(attachmentCount)
			: labels.attachmentPlural(attachmentCount);
	}

	return labels.empty;
}

/**
 * Derive the serializable outline (one entry per USER message). The last user
 * message is flagged `isLatest` so the rail can de-emphasise the in-flight turn.
 */
export function deriveOutlineEntries(
	messages: readonly OutlineSourceMessage[],
	labels: OutlineLabels = DEFAULT_LABELS,
): OutlineEntry[] {
	const userMessages = messages.filter((message) => message.role === "user");

	return userMessages.map((message, index) => ({
		id: message.id,
		preview: buildOutlinePreview(message, labels),
		isLatest: index === userMessages.length - 1,
	}));
}

/**
 * Resolve the active outline entry given pre-measured marker tops and the
 * current scroll position. Pure so it is unit-testable without a DOM.
 */
export function findActiveOutlineId(
	entries: readonly { id: string; top: number }[],
	scrollTop: number,
): string | null {
	if (entries.length === 0) {
		return null;
	}

	let activeId = entries[0]?.id ?? null;
	const adjustedTop = scrollTop + 4;

	for (const entry of entries) {
		if (entry.top <= adjustedTop) {
			activeId = entry.id;
			continue;
		}
		break;
	}

	return activeId;
}

/**
 * Push a visited id onto a bounded nav-history stack, de-duplicating the head
 * and capping length. Used by Alt+←/→ desktop nav and mobile edge-swipe.
 */
export function pushNavHistory(
	stack: readonly string[],
	id: string,
	max = 50,
): string[] {
	if (stack[stack.length - 1] === id) {
		return [...stack];
	}

	const next = [...stack, id];
	return next.length > max ? next.slice(next.length - max) : next;
}
