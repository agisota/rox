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
