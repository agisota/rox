import {
	type BoardCard,
	type BoardCardRow,
	type BoardColumn,
	countBoardCards,
	groupTasksByStatus,
} from "@rox/shared/issue-board";
import { Avatar, AvatarFallback, AvatarImage } from "@rox/ui/avatar";
import { Badge } from "@rox/ui/badge";
import { Skeleton } from "@rox/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { LuLayoutDashboard } from "react-icons/lu";
import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";

/** Cards pulled per board load (the shipped `task.list` cap). */
const BOARD_CARD_LIMIT = 500;

export interface IssueBoardPanelProps {
	/** Optional fallback rendered when the gate is closed (OFF = absent). */
	fallback?: React.ReactNode;
}

/**
 * Desktop parity for `projectOs.issueBoard` — a gated org-wide issue/task board
 * over the native Rox tasks. Columns are the org's REAL task statuses
 * (`task.statuses.list`) and cards are the org's REAL tasks (`task.list`),
 * grouped through the REUSED pure mapper `@rox/shared/issue-board` →
 * `groupTasksByStatus` (the SAME module the web `IssueBoardPanel` consumes after
 * its promotion from `apps/web`).
 *
 * Ports `apps/web/.../(agents)/agents/board/IssueBoardPanel.tsx` and reuses the
 * same shipped cloud queries the desktop ProjectObjectGraph shell already calls
 * (`task: taskRouter` is mounted on the cloud appRouter). No new query, no
 * migration, no flag flip — this is the gated desktop surface.
 *
 * This is an ORG-WIDE status board: project scoping is intentionally absent
 * because `tasks` are org-scoped (no `v2_project_id`) and are not mirrored into
 * the entities graph, so there is no real task→project link to filter on — the
 * same rationale as the web surface. Read-first: moving/editing a card is a
 * documented follow-up.
 *
 * Mounted only when {@link ExperimentalFeatureGate} opens for
 * `projectOs.issueBoard`; OFF means the surface is absent (no regression).
 */
export function IssueBoardPanel({ fallback = null }: IssueBoardPanelProps) {
	return (
		<ExperimentalFeatureGate
			featureId="projectOs.issueBoard"
			fallback={fallback}
		>
			<IssueBoardSurface />
		</ExperimentalFeatureGate>
	);
}

/** The live surface, mounted only once the gate resolves `available`. */
function IssueBoardSurface() {
	const trpc = useTRPC();

	const statusesQuery = useQuery(trpc.task.statuses.list.queryOptions());
	const tasksQuery = useQuery(
		trpc.task.list.queryOptions({ limit: BOARD_CARD_LIMIT }),
	);

	const columns: BoardColumn[] = useMemo(() => {
		const statuses = statusesQuery.data ?? [];
		const allCards = (tasksQuery.data ?? []) as BoardCardRow[];
		return groupTasksByStatus(statuses, allCards);
	}, [statusesQuery.data, tasksQuery.data]);

	const isLoading = statusesQuery.isLoading || tasksQuery.isLoading;
	const isError = statusesQuery.isError || tasksQuery.isError;
	const totalCards = countBoardCards(columns);

	return (
		<section className="space-y-4" aria-label="Доска задач">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex items-center gap-2">
					<LuLayoutDashboard className="size-5 text-muted-foreground" />
					<div>
						<h2 className="font-semibold text-lg">Доска задач</h2>
						<p className="text-muted-foreground text-sm">
							Задачи организации по колонкам статусов.
						</p>
					</div>
				</div>
				{!isLoading && !isError ? (
					<Badge variant="secondary">{totalCards} задач</Badge>
				) : null}
			</div>

			<BoardBody
				isLoading={isLoading}
				isError={isError}
				columns={columns}
				onRetry={() => {
					void statusesQuery.refetch();
					void tasksQuery.refetch();
				}}
			/>
		</section>
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
