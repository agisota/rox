import type { SelectTaskStatus, SelectUser } from "@rox/db/schema";
import { eq, isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import {
	groupByStatus,
	type TaskSection,
	type TaskWithStatus,
} from "../../utils/groupByStatus";
import { compareTasks } from "../../utils/sorting";

export type { TaskWithStatus, TaskSection };

interface UseTasksDataResult {
	sections: TaskSection[];
	allStatuses: SelectTaskStatus[];
	isReady: boolean;
}

/**
 * Live Tasks data for the mobile Tasks list.
 * Ports the desktop join (tasks INNER JOIN status LEFT JOIN assignee), sorts via
 * compareTasks, and groups into SectionList sections by status type.
 */
export function useTasksData(): UseTasksDataResult {
	const collections = useCollections();

	const { data: allData, isReady } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.innerJoin({ status: collections.taskStatuses }, ({ tasks, status }) =>
					eq(tasks.statusId, status.id),
				)
				.leftJoin({ assignee: collections.users }, ({ tasks, assignee }) =>
					eq(tasks.assigneeId, assignee.id),
				)
				.select(({ tasks, status, assignee }) => ({
					...tasks,
					status,
					assignee: assignee ?? null,
				}))
				.where(({ tasks }) => isNull(tasks.deletedAt)),
		[collections],
	);

	const { data: statusData } = useLiveQuery(
		(q) =>
			q
				.from({ taskStatuses: collections.taskStatuses })
				.select(({ taskStatuses }) => ({ ...taskStatuses })),
		[collections],
	);

	const allStatuses = useMemo(() => statusData ?? [], [statusData]);

	const sections = useMemo(() => {
		if (!allData) return [];
		const normalized = allData.map((task) => ({
			...task,
			assignee:
				typeof task.assignee?.id === "string"
					? (task.assignee as SelectUser)
					: null,
		})) as TaskWithStatus[];
		const sorted = [...normalized].sort(compareTasks);
		return groupByStatus(sorted);
	}, [allData]);

	return { sections, allStatuses, isReady };
}
