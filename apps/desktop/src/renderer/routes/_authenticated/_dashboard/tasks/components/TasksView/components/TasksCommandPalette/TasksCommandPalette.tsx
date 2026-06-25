import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@rox/ui/command";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { GoGitPullRequest, GoIssueOpened } from "react-icons/go";
import {
	HiOutlineFolder,
	HiOutlinePlay,
	HiOutlineQueueList,
	HiOutlineViewColumns,
} from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { TypeTab, ViewMode } from "../../../../stores/tasks-filter-state";
import { ActiveIcon } from "../shared/icons/ActiveIcon";

interface TasksCommandPaletteProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	typeTab: TypeTab;
	viewMode: ViewMode;
	projectFilter: string | null;
	selectedCount: number;
	onTypeTabChange: (type: TypeTab) => void;
	onViewModeChange: (mode: ViewMode) => void;
	onProjectFilterChange: (projectId: string) => void;
	/** Run the current selection (tasks or issues) in a workspace. */
	onRunSelected?: () => void;
}

const TYPE_TAB_ITEMS: Array<{
	value: TypeTab;
	label: string;
	Icon: typeof GoGitPullRequest;
}> = [
	{ value: "tasks", label: "Задачи", Icon: ActiveIcon },
	{ value: "prs", label: "PR", Icon: GoGitPullRequest },
	{ value: "issues", label: "Issues", Icon: GoIssueOpened },
];

/**
 * Pane-scoped ⌘K palette for the Tasks view. Unlike the global command
 * palette, this only offers actions that make sense in the current pane:
 * jump to a project, switch the type tab, toggle the table/board view, and run
 * the current selection. Built on the shared `@rox/ui` cmdk `CommandDialog`
 * (the issue's reuse directive) — no direct cmdk dependency.
 *
 * The action set is headless-friendly: every effect is delegated to a callback
 * prop, so a web/mobile shell can mount the same palette with its own
 * navigation handlers.
 */
export function TasksCommandPalette({
	open,
	onOpenChange,
	typeTab,
	viewMode,
	projectFilter,
	selectedCount,
	onTypeTabChange,
	onViewModeChange,
	onProjectFilterChange,
	onRunSelected,
}: TasksCommandPaletteProps) {
	const collections = useCollections();
	const { data: allProjects } = useLiveQuery(
		(q) => q.from({ projects: collections.v2Projects }),
		[collections],
	);
	const projects = useMemo(() => allProjects ?? [], [allProjects]);

	const run = (fn: () => void) => {
		fn();
		onOpenChange(false);
	};

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Палитра задач"
			description="Действия для текущего пейна"
		>
			<CommandInput placeholder="Действие или проект…" />
			<CommandList>
				<CommandEmpty>Ничего не найдено.</CommandEmpty>

				<CommandGroup heading="Тип">
					{TYPE_TAB_ITEMS.map(({ value, label, Icon }) => (
						<CommandItem
							key={value}
							disabled={value === typeTab}
							onSelect={() => run(() => onTypeTabChange(value))}
						>
							<Icon className="size-4" />
							<span>Переключить на «{label}»</span>
						</CommandItem>
					))}
				</CommandGroup>

				{typeTab === "tasks" && (
					<>
						<CommandSeparator />
						<CommandGroup heading="Вид">
							<CommandItem
								disabled={viewMode === "table"}
								onSelect={() => run(() => onViewModeChange("table"))}
							>
								<HiOutlineQueueList className="size-4" />
								<span>Табличный вид</span>
							</CommandItem>
							<CommandItem
								disabled={viewMode === "board"}
								onSelect={() => run(() => onViewModeChange("board"))}
							>
								<HiOutlineViewColumns className="size-4" />
								<span>Доска</span>
							</CommandItem>
						</CommandGroup>
					</>
				)}

				{onRunSelected && selectedCount > 0 && (
					<>
						<CommandSeparator />
						<CommandGroup heading="Выделение">
							<CommandItem onSelect={() => run(() => onRunSelected())}>
								<HiOutlinePlay className="size-4" />
								<span>Запустить выбранные ({selectedCount})</span>
							</CommandItem>
						</CommandGroup>
					</>
				)}

				<CommandSeparator />
				<CommandGroup heading="Проект">
					{projects.map((project) => (
						<CommandItem
							key={project.id}
							value={`project ${project.name}`}
							disabled={project.id === projectFilter}
							onSelect={() => run(() => onProjectFilterChange(project.id))}
						>
							<HiOutlineFolder className="size-4" />
							<span>{project.name}</span>
						</CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
