"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@rox/ui/avatar";
import { Badge } from "@rox/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { Skeleton } from "@rox/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useTRPC } from "@/trpc/react";
import {
	type BoardCard,
	type BoardCardRow,
	type BoardColumn,
	countBoardCards,
	filterCardsToProjectSlugs,
	groupTasksByStatus,
	selectProjectTaskSlugs,
} from "./issueBoard";

/** Sentinel for the "all tasks" (no project filter) picker option. */
const ALL_PROJECTS = "__all__";

/**
 * Native issue board (`projectOs.issueBoard`). Groups the org's REAL tasks into
 * their REAL status columns over two shipped queries — `task.statuses.list`
 * (columns) and `task.list` (cards) — with the pure {@link groupTasksByStatus}.
 * A project picker scopes the board to one `v2_project` by intersecting the org
 * cards with the project's task-kind nodes from the shipped `graph.projectGraph`
 * walk ({@link selectProjectTaskSlugs} + {@link filterCardsToProjectSlugs}). No
 * new query and no migration — tasks stay org-scoped; the project intersection is
 * derived from the existing object graph.
 *
 * Mounted only once {@link resolveIssueBoardGate} opens (active org + the
 * experimental feature resolves `available`), so the org scope on the routers
 * (`requireActiveOrgMembership`) always has a caller. Read-first: moving/editing a
 * card is a documented follow-up.
 */
export function IssueBoardPanel({
	organizationId,
}: {
	organizationId: string;
}) {
	const trpc = useTRPC();
	const [projectId, setProjectId] = useState<string>(ALL_PROJECTS);
	const hasProject = projectId !== ALL_PROJECTS;

	const projectsQuery = useQuery(
		trpc.v2Project.list.queryOptions({ organizationId }),
	);
	const statusesQuery = useQuery(trpc.task.statuses.list.queryOptions());
	const tasksQuery = useQuery(trpc.task.list.queryOptions({ limit: 500 }));
	const projectGraphQuery = useQuery({
		...trpc.graph.projectGraph.queryOptions({
			v2ProjectId: hasProject ? projectId : "",
		}),
		enabled: hasProject,
	});

	const columns: BoardColumn[] = useMemo(() => {
		const statuses = statusesQuery.data ?? [];
		const allCards = (tasksQuery.data ?? []) as BoardCardRow[];
		if (!hasProject) {
			return groupTasksByStatus(statuses, allCards);
		}
		// Project selected: intersect the org cards with the project's task-kind
		// graph nodes. While the graph is still loading, render no cards (columns
		// stay, so the board frame is stable) rather than the full org set.
		if (!projectGraphQuery.data) {
			return groupTasksByStatus(statuses, []);
		}
		const projectSlugs = selectProjectTaskSlugs(projectGraphQuery.data);
		return groupTasksByStatus(
			statuses,
			filterCardsToProjectSlugs(allCards, projectSlugs),
		);
	}, [statusesQuery.data, tasksQuery.data, projectGraphQuery.data, hasProject]);

	const isLoading =
		statusesQuery.isLoading ||
		tasksQuery.isLoading ||
		(hasProject && projectGraphQuery.isLoading);
	const isError = statusesQuery.isError || tasksQuery.isError;
	const totalCards = countBoardCards(columns);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="font-semibold text-lg">Доска задач</h2>
					<p className="text-muted-foreground text-sm">
						Задачи проекта по колонкам статусов. Выберите проект, чтобы
						ограничить доску его задачами.
					</p>
				</div>
				<div className="flex items-center gap-2">
					{!isLoading && !isError ? (
						<Badge variant="secondary">{totalCards} задач</Badge>
					) : null}
					<Select value={projectId} onValueChange={setProjectId}>
						<SelectTrigger
							className="w-56"
							aria-label="Проект"
							disabled={projectsQuery.isLoading}
						>
							<SelectValue placeholder="Все задачи" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL_PROJECTS}>Все задачи</SelectItem>
							{(projectsQuery.data ?? []).map((project) => (
								<SelectItem key={project.id} value={project.id}>
									{project.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<BoardBody
				isLoading={isLoading}
				isError={isError}
				columns={columns}
				onRetry={() => {
					void statusesQuery.refetch();
					void tasksQuery.refetch();
					if (hasProject) void projectGraphQuery.refetch();
				}}
			/>
		</div>
	);
}

function BoardBody({
	isLoading,
	isError,
	columns,
	onRetry,
}: {
	isLoading: boolean;
	isError: boolean;
	columns: BoardColumn[];
	onRetry: () => void;
}) {
	if (isError) {
		return (
			<div className="rounded-lg border border-destructive/40 p-4 text-sm">
				<p className="text-destructive">Не удалось загрузить доску задач.</p>
				<button
					type="button"
					onClick={onRetry}
					className="mt-2 text-muted-foreground underline underline-offset-4 hover:text-foreground"
				>
					Повторить
				</button>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex gap-3 overflow-x-auto pb-2">
				{[0, 1, 2].map((i) => (
					<div key={i} className="w-72 shrink-0 space-y-2">
						<Skeleton className="h-7 w-full rounded-md" />
						<Skeleton className="h-20 w-full rounded-lg" />
						<Skeleton className="h-20 w-full rounded-lg" />
					</div>
				))}
			</div>
		);
	}

	if (columns.length === 0) {
		return (
			<p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				Нет статусов задач. Создайте задачу, чтобы появились колонки.
			</p>
		);
	}

	return (
		<div className="flex gap-3 overflow-x-auto pb-2">
			{columns.map((column) => (
				<BoardColumnView key={column.id} column={column} />
			))}
		</div>
	);
}

function BoardColumnView({ column }: { column: BoardColumn }) {
	return (
		<section className="flex w-72 shrink-0 flex-col gap-2">
			<header className="flex items-center justify-between gap-2 rounded-md border bg-secondary/30 px-3 py-2">
				<span className="flex min-w-0 items-center gap-2">
					<span
						aria-hidden
						className="size-2.5 shrink-0 rounded-full"
						style={{ backgroundColor: column.color }}
					/>
					<span className="truncate font-medium text-sm">{column.name}</span>
				</span>
				<Badge variant="outline">{column.cards.length}</Badge>
			</header>
			{column.cards.length === 0 ? (
				<p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-xs">
					Пусто
				</p>
			) : (
				<ul className="flex flex-col gap-2">
					{column.cards.map((card) => (
						<li key={card.id}>
							<IssueCardView card={card} />
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function IssueCardView({ card }: { card: BoardCard }) {
	return (
		<article className="rounded-lg border bg-card p-3 transition-colors hover:bg-accent">
			<p className="line-clamp-3 font-medium text-sm">{card.title}</p>
			<div className="mt-2 flex items-center justify-between gap-2">
				<Badge variant="outline" className="text-xs">
					{card.priorityLabel}
				</Badge>
				{card.assigneeName ? (
					<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<Avatar className="size-5">
							{card.assigneeImage ? (
								<AvatarImage src={card.assigneeImage} alt={card.assigneeName} />
							) : null}
							<AvatarFallback className="text-[10px]">
								{card.assigneeName.slice(0, 2).toUpperCase()}
							</AvatarFallback>
						</Avatar>
						<span className="max-w-24 truncate">{card.assigneeName}</span>
					</span>
				) : null}
			</div>
		</article>
	);
}
