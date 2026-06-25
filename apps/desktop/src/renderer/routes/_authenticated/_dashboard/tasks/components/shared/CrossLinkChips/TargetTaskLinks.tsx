import { Button } from "@rox/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@rox/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LuListTodo } from "react-icons/lu";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { type TaskLinkTargetKind, useTaskLinks } from "../../../linkage";
import { CrossLinkChip } from "./CrossLinkChip";

interface TargetTaskLinksProps {
	projectId: string | null;
	kind: TaskLinkTargetKind;
	targetNumber: number;
	targetTitle: string;
	targetUrl: string;
	/** Compact mode hides the "link task" affordance (e.g. dense list rows). */
	compact?: boolean;
}

/**
 * Cross-chip surface on a PR/issue (detail or row). Renders the tasks linked to
 * this PR/issue as clickable chips that navigate to the task detail, plus an
 * optional picker to link a task. Mirror of {@link TaskDetailCrossLinks} on the
 * other side of the headless `useTaskLinks` model.
 */
export function TargetTaskLinks({
	projectId,
	kind,
	targetNumber,
	targetTitle,
	targetUrl,
	compact = false,
}: TargetTaskLinksProps) {
	const navigate = useNavigate();
	const collections = useCollections();
	const { linksForTarget, upsertLink, removeLink } = useTaskLinks({
		target: { kind, targetNumber },
	});
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const { data: allTasks } = useLiveQuery(
		(q) => q.from({ tasks: collections.tasks }),
		[collections],
	);
	const tasks = useMemo(() => {
		const q = search.trim().toLowerCase();
		const rows = allTasks ?? [];
		const filtered = q
			? rows.filter((t) => t.title.toLowerCase().includes(q))
			: rows;
		return filtered.slice(0, 8);
	}, [allTasks, search]);

	const goToTask = (taskId: string) =>
		navigate({
			to: "/tasks/$taskId",
			params: { taskId },
			search: projectId ? { project: projectId } : {},
		});

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{linksForTarget.map((link) => (
				<CrossLinkChip
					key={link.id}
					kind="task"
					label={`Задача`}
					onClick={() => goToTask(link.taskId)}
					onRemove={compact ? undefined : () => removeLink(link.id)}
				/>
			))}

			{!compact && projectId && (
				<Popover
					open={open}
					onOpenChange={(next) => {
						setOpen(next);
						if (!next) setSearch("");
					}}
				>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className="h-6 gap-1 px-2 text-[11px]"
						>
							<LuListTodo className="size-3" />
							Связать задачу
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-80 p-0" align="start">
						<Command shouldFilter={false}>
							<CommandInput
								placeholder="Поиск задачи…"
								value={search}
								onValueChange={setSearch}
							/>
							<CommandList>
								<CommandEmpty>Задачи не найдены.</CommandEmpty>
								<CommandGroup heading="Задачи">
									{tasks.map((task) => (
										<CommandItem
											key={task.id}
											value={task.id}
											onSelect={() => {
												upsertLink({
													projectId,
													taskId: task.id,
													kind,
													targetNumber,
													targetTitle,
													targetUrl,
												});
												setOpen(false);
												setSearch("");
											}}
										>
											<LuListTodo className="size-4" />
											<span className="truncate">{task.title}</span>
										</CommandItem>
									))}
								</CommandGroup>
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
			)}
		</div>
	);
}
