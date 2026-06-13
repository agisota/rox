import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardListIcon } from "lucide-react";
import { useShouldAnimate } from "renderer/motion";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { getResult } from "../../../../utils/tool-helpers";
import { formatTaskDate, toStringArray } from "../../utils/taskToolCallHelpers";
import { RoxToolCall } from "../RoxToolCall";
import { TaskItemDisplay } from "../TaskItemDisplay";

interface ListTasksToolCallProps {
	part: ToolPart;
}

export function ListTasksToolCall({ part }: ListTasksToolCallProps) {
	const navigate = useNavigate();
	const shouldAnimate = useShouldAnimate("decorative");
	const result = getResult(part);
	const resultData =
		typeof result.result === "object" && result.result !== null
			? (result.result as Record<string, unknown>)
			: result;
	const tasks = Array.isArray(resultData.tasks)
		? resultData.tasks.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null,
			)
		: [];
	const count =
		typeof resultData.count === "number"
			? resultData.count
			: typeof resultData.total === "number"
				? resultData.total
				: tasks.length;
	const hasMore = resultData.hasMore === true;

	function renderTaskItems(taskSlice: Record<string, unknown>[]) {
		return taskSlice.map((task) => {
			const taskId = typeof task.id === "string" ? task.id : null;
			const slug = typeof task.slug === "string" ? task.slug : null;
			const openTaskId = taskId ?? slug;
			const title =
				typeof task.title === "string" ? task.title : "Задача без названия";
			const status =
				typeof task.statusName === "string" ? task.statusName : null;
			const statusType =
				typeof task.statusType === "string" ? task.statusType : null;
			const statusColor =
				typeof task.statusColor === "string" ? task.statusColor : null;
			const statusProgress =
				typeof task.statusProgress === "number" ? task.statusProgress : null;
			const priority = typeof task.priority === "string" ? task.priority : null;
			const assignee =
				typeof task.assigneeName === "string" ? task.assigneeName : null;
			const assigneeImage =
				typeof task.assigneeImage === "string"
					? task.assigneeImage
					: typeof task.assigneeAvatarUrl === "string"
						? task.assigneeAvatarUrl
						: null;
			const dueDate = formatTaskDate(task.dueDate);
			const estimate =
				typeof task.estimate === "number" ? String(task.estimate) : null;
			const labels = toStringArray(task.labels);
			const description =
				typeof task.description === "string" ? task.description : null;
			const creator =
				typeof task.creatorName === "string" ? task.creatorName : null;
			const branch = typeof task.branch === "string" ? task.branch : null;
			const prUrl = typeof task.prUrl === "string" ? task.prUrl : null;
			const extraDetails = [
				creator ? { label: "Автор", value: creator } : null,
				branch ? { label: "Ветка", value: branch } : null,
				prUrl ? { label: "PR", value: prUrl } : null,
			].filter((detail): detail is { label: string; value: string } =>
				Boolean(detail),
			);

			return (
				<TaskItemDisplay
					key={taskId ?? slug ?? title}
					assignee={assignee}
					description={description}
					dueDate={dueDate}
					estimate={estimate}
					extraDetails={extraDetails}
					labels={labels}
					priority={priority}
					slug={slug}
					status={status}
					statusColor={statusColor}
					statusProgress={statusProgress}
					statusType={statusType}
					taskId={taskId}
					title={title}
					assigneeImage={assigneeImage}
					onClick={
						openTaskId
							? () =>
									navigate({
										to: "/tasks/$taskId",
										params: { taskId: openTaskId },
									})
							: undefined
					}
				/>
			);
		});
	}

	return (
		<RoxToolCall
			part={part}
			toolName="List tasks"
			icon={ClipboardListIcon}
			details={
				<div className="space-y-2">
					<div className="text-muted-foreground">
						Found: {count} task{count === 1 ? "" : "s"}
						{hasMore ? " (more available)" : ""}
					</div>
					{tasks.length > 0 ? (
						<AnimatePresence initial={false}>
							{shouldAnimate ? (
								<motion.div
									key="task-items"
									className="space-y-1"
									initial="hidden"
									animate="visible"
									transition={{ staggerChildren: 0.04 }}
								>
									{renderTaskItems(tasks.slice(0, 6))}
								</motion.div>
							) : (
								<div className="space-y-1">
									{renderTaskItems(tasks.slice(0, 6))}
								</div>
							)}
						</AnimatePresence>
					) : (
						<div className="text-muted-foreground">В результате нет задач.</div>
					)}
				</div>
			}
		/>
	);
}
