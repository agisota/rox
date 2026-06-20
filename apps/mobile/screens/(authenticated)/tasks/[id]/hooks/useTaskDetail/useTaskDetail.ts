import type { SelectUser } from "@rox/db/schema";
import { eq, isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
import type { TaskWithStatus } from "@/screens/(authenticated)/(tasks)/tasks/utils/groupByStatus";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { firstCompletedStatusId, selectTaskById } from "./selectTaskById";

interface UseTaskDetailResult {
	task: TaskWithStatus | null;
	isReady: boolean;
	canComplete: boolean;
	markComplete: () => void;
}

/**
 * Live detail for a single task, joined to its status and assignee.
 * Cache-first: returns the persisted row as soon as it is available, even
 * before the collection reports ready.
 */
export function useTaskDetail(id: string): UseTaskDetailResult {
	const collections = useCollections();

	const { data, isReady } = useLiveQuery(
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

	const task = useMemo(() => {
		const rows = data?.map((row) => ({
			...row,
			assignee:
				typeof row.assignee?.id === "string"
					? (row.assignee as SelectUser)
					: null,
		})) as TaskWithStatus[] | undefined;
		return selectTaskById(rows, id);
	}, [data, id]);

	const completedStatusId = useMemo(
		() => firstCompletedStatusId(statusData ?? []),
		[statusData],
	);

	const canComplete =
		task !== null &&
		completedStatusId !== null &&
		task.status.type !== "completed";

	const markComplete = useCallback(() => {
		if (!task || !completedStatusId) return;
		collections.tasks.update(task.id, (draft) => {
			draft.statusId = completedStatusId;
		});
	}, [collections, task, completedStatusId]);

	return { task, isReady, canComplete, markComplete };
}
