import type { SelectTaskStatus } from "@rox/db/schema";
import type { TaskWithStatus } from "@/screens/(authenticated)/(tasks)/tasks/utils/groupByStatus";

/**
 * Pick a single joined task by id from a live-query result. Null when absent.
 */
export function selectTaskById(
	tasks: TaskWithStatus[] | undefined,
	id: string,
): TaskWithStatus | null {
	if (!tasks || tasks.length === 0) return null;
	return tasks.find((t) => t.id === id) ?? null;
}

/**
 * The id of the lowest-position "completed" status, used by the mark-complete
 * action. Null when the org has no completed-type status.
 */
export function firstCompletedStatusId(
	statuses: SelectTaskStatus[],
): string | null {
	const completed = statuses
		.filter((s) => s.type === "completed")
		.sort((a, b) => a.position - b.position);
	return completed[0]?.id ?? null;
}
