import type { SelectMemoryItem } from "@rox/db/schema";

/** RU label for where a memory came from (its `source`). */
export const SOURCE_LABEL: Record<SelectMemoryItem["source"], string> = {
	manual: "вручную",
	agent: "от агента",
	archive: "из архива",
	prompt: "из импорта",
};

/**
 * A short human-readable provenance line for a memory item, e.g.
 * "из архива · 2026-06-12". Returns null for plain manual items with no extra
 * ref (nothing interesting to surface).
 */
export function provenanceLabel(item: SelectMemoryItem): string | null {
	const base = SOURCE_LABEL[item.source];
	const ref = item.sourceRef;
	const parts: string[] = [base];

	if (ref) {
		if (typeof ref.day === "string" && ref.day) parts.push(ref.day);
		else if (typeof ref.importedAt === "string" && ref.importedAt) {
			const d = new Date(ref.importedAt);
			if (!Number.isNaN(d.getTime())) {
				parts.push(d.toISOString().slice(0, 10));
			}
		}
	}

	if (item.source === "manual" && parts.length === 1) return null;
	return parts.join(" · ");
}

/**
 * Capitalized source titles for the provenance popover header
 * (`Вручную/Агент/Импорт/Промпт`), distinct from the lowercase inline
 * {@link SOURCE_LABEL} used in the one-line summary under each row.
 */
export const SOURCE_TITLE: Record<SelectMemoryItem["source"], string> = {
	manual: "Вручную",
	agent: "Агент",
	archive: "Импорт",
	prompt: "Промпт",
};

/** One labelled provenance fact rendered as a row in the provenance popover. */
export interface ProvenanceDetail {
	label: string;
	value: string;
}

/**
 * Structured provenance for the drill-in popover: the source title plus any
 * `sourceRef` facts worth showing (day, conversation, import time), and the
 * `conversationId` to deep-link the originating session when present.
 *
 * Cross-platform: derived purely from the resident row, no server call.
 */
export interface ProvenanceInfo {
	source: SelectMemoryItem["source"];
	sourceTitle: string;
	details: ProvenanceDetail[];
	/** Set when the item carries a linkable conversation/session id. */
	conversationId: string | null;
}

function formatImportedAt(value: string): string {
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return value;
	return d.toISOString().slice(0, 10);
}

/**
 * Build the structured provenance shown in the "i" popover. For agent/import
 * items this surfaces day / conversation / importedAt from `sourceRef`; the
 * caller offers an "Открыть сессию" deep-link only when `conversationId` is set.
 */
export function provenanceInfo(item: SelectMemoryItem): ProvenanceInfo {
	const ref = item.sourceRef;
	const details: ProvenanceDetail[] = [];
	let conversationId: string | null = null;

	if (ref) {
		if (typeof ref.day === "string" && ref.day) {
			details.push({ label: "День", value: ref.day });
		}
		conversationId =
			typeof ref.conversationId === "string" && ref.conversationId
				? ref.conversationId
				: typeof ref.sessionId === "string" && ref.sessionId
					? ref.sessionId
					: null;
		if (conversationId) {
			details.push({ label: "Диалог", value: conversationId });
		}
		if (typeof ref.importedAt === "string" && ref.importedAt) {
			details.push({
				label: "Импортировано",
				value: formatImportedAt(ref.importedAt),
			});
		}
	}

	return {
		source: item.source,
		sourceTitle: SOURCE_TITLE[item.source],
		details,
		conversationId,
	};
}
