import type { SelectTask, SelectTaskStatus, SelectUser } from "@rox/db/schema";

export type TaskWithStatus = SelectTask & {
	status: SelectTaskStatus;
	assignee: SelectUser | null;
};

export type StatusType =
	| "backlog"
	| "unstarted"
	| "started"
	| "completed"
	| "canceled";

export interface TaskSection {
	type: StatusType;
	title: string;
	data: TaskWithStatus[];
}

// Workflow order (matches desktop dropdown order): backlog -> unstarted -> started -> completed -> canceled.
const SECTION_ORDER: StatusType[] = [
	"backlog",
	"unstarted",
	"started",
	"completed",
	"canceled",
];

const SECTION_TITLES: Record<StatusType, string> = {
	backlog: "Backlog",
	unstarted: "Todo",
	started: "In Progress",
	completed: "Done",
	canceled: "Canceled",
};

/**
 * Group joined tasks into SectionList sections ordered by status type.
 * Soft-deleted tasks (deletedAt set) are filtered out. Empty sections are omitted.
 * Preserves the incoming order of tasks within a section (caller is expected to
 * pre-sort via compareTasks).
 */
export function groupByStatus(tasks: TaskWithStatus[]): TaskSection[] {
	const buckets = new Map<StatusType, TaskWithStatus[]>();

	for (const task of tasks) {
		if (task.deletedAt) continue;
		const type = task.status.type as StatusType;
		if (!SECTION_ORDER.includes(type)) continue;
		const bucket = buckets.get(type);
		if (bucket) {
			bucket.push(task);
		} else {
			buckets.set(type, [task]);
		}
	}

	return SECTION_ORDER.flatMap((type) => {
		const data = buckets.get(type);
		if (!data || data.length === 0) return [];
		return [{ type, title: SECTION_TITLES[type], data }];
	});
}
