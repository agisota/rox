import type { SelectTask, SelectTaskStatus } from "@rox/db/schema";

// Status-type ordering for grouped list rendering (matches the desktop table grouping intent).
const STATUS_TYPE_ORDER: Record<string, number> = {
	started: 0,
	unstarted: 1,
	backlog: 2,
	completed: 3,
	canceled: 4,
};

// Priority ordering (urgent at top, none at bottom).
const PRIORITY_ORDER: Record<string, number> = {
	urgent: 0,
	high: 1,
	medium: 2,
	low: 3,
	none: 4,
};

function getStatusTypeOrder(type: string): number {
	return STATUS_TYPE_ORDER[type] ?? Number.MAX_SAFE_INTEGER;
}

function getPriorityOrder(priority: string): number {
	return PRIORITY_ORDER[priority] ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Compare two joined tasks for sorting: status type -> status position -> priority.
 * Mirror of the desktop `compareTasks` so the mobile list orders identically.
 */
export function compareTasks(
	a: SelectTask & { status: SelectTaskStatus },
	b: SelectTask & { status: SelectTaskStatus },
): number {
	const typeOrderA = getStatusTypeOrder(a.status.type);
	const typeOrderB = getStatusTypeOrder(b.status.type);
	if (typeOrderA !== typeOrderB) {
		return typeOrderA - typeOrderB;
	}

	if (a.status.position !== b.status.position) {
		return a.status.position - b.status.position;
	}

	return getPriorityOrder(a.priority) - getPriorityOrder(b.priority);
}
