/**
 * Collapse a message body into a single-line preview for the thread list.
 *
 * Pure presentation over an already-loaded message body — no network. Strips
 * newlines and clamps length so a long first message can't blow out the row.
 */

const MAX_PREVIEW = 120;

export function messagePreview(
	body: string | null | undefined,
	max = MAX_PREVIEW,
): string {
	const flat = (body ?? "").replace(/\s+/g, " ").trim();
	if (flat.length <= max) return flat;
	return `${flat.slice(0, max - 1).trimEnd()}…`;
}
