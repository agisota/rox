import type { SelectTask } from "@rox/db/schema";

const PRIORITY_LABELS: Record<string, string> = {
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
};

/**
 * Human label for a task priority chip. Returns null for "none" so the UI can
 * omit the chip entirely.
 */
export function priorityLabel(priority: SelectTask["priority"]): string | null {
	return PRIORITY_LABELS[priority] ?? null;
}

/**
 * The short reference shown as a badge: external key (e.g. "SUPER-172") when the
 * task is synced, otherwise the slug. Null when neither is available.
 */
export function taskRef(task: {
	externalKey: string | null;
	slug: string;
}): string | null {
	if (task.externalKey?.trim()) return task.externalKey;
	if (task.slug?.trim()) return task.slug;
	return null;
}

/**
 * Up to two uppercase initials from a display name; "?" when unknown.
 */
export function assigneeInitials(name: string | null | undefined): string {
	const trimmed = (name ?? "").trim();
	if (!trimmed) return "?";
	const parts = trimmed.split(/\s+/).filter(Boolean);
	const initials = parts
		.slice(0, 2)
		.map((p) => p.charAt(0).toUpperCase())
		.join("");
	return initials || "?";
}
