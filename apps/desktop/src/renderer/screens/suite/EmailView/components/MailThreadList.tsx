import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Checkbox } from "@rox/ui/checkbox";
import { Skeleton } from "@rox/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@rox/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	Archive,
	ArchiveRestore,
	Inbox,
	Mail,
	MailOpen,
	Star,
	Trash2,
} from "lucide-react";
import { useRef } from "react";
import { MAIL_FOLDER_EMPTY } from "../lib/mailFolders";
import { formatListTime } from "../lib/mailFormat";
import type { MailFolderId, MailThreadSummary } from "../lib/mailTypes";

/** Fixed row height (px) used for virtual measurement; rows clamp to this. */
const ROW_HEIGHT = 72;

export type MailReadFilter = "all" | "unread";

/** Per-row hover/bulk action callbacks. */
export interface MailThreadRowActions {
	onArchive: (id: string) => void;
	onTrash: (id: string) => void;
	onRestore: (id: string) => void;
	onToggleRead: (id: string) => void;
	onToggleStar: (id: string) => void;
}

export interface MailThreadListProps {
	folder: MailFolderId;
	threads: MailThreadSummary[];
	activeThreadId: string | null;
	onSelect: (id: string) => void;
	readFilter: MailReadFilter;
	onReadFilterChange: (value: MailReadFilter) => void;
	isLoading: boolean;
	/** Thread ids the user has opened (drives unread bold + the dot). */
	openedThreadIds: ReadonlySet<string>;
	/** Starred thread ids. */
	flagged: Record<string, true>;
	/** Selected ids for bulk operations. */
	selected: ReadonlySet<string>;
	onToggleSelect: (id: string) => void;
	onClearSelection: () => void;
	onSelectAll: () => void;
	/** Bulk-bar actions over the current selection. */
	onBulkArchive: () => void;
	onBulkTrash: () => void;
	onBulkRead: () => void;
	/** Per-row actions. */
	actions: MailThreadRowActions;
}

/**
 * Panel 2 — the virtualized thread list. `@tanstack/react-virtual` keeps the DOM
 * light for a large mailbox. A sticky header carries the Все/Непрочитанные
 * segment and a bulk-action bar that appears when rows are selected. Each row
 * shows subject, a message-count preview, relative time, an unread dot/bold
 * weight (heuristic, see mailCounts), a star toggle, and hover actions
 * (archive/delete/read). A checkbox enables multi-select.
 *
 * SENDER CAVEAT: `mail.listThreads` returns the flat thread row only (no
 * per-message sender). So the row leads with the subject; the per-message sender
 * surfaces in the reader. TODO(server): add a `lastSender` + `snippet` rollup to
 * `MailThreadSummary` to show a sender + body preview per row (Gmail-style).
 *
 * Glass: `bg-card/55 backdrop-blur` panel; active row `bg-accent`, hover
 * `bg-accent/40`.
 */
export function MailThreadList({
	folder,
	threads,
	activeThreadId,
	onSelect,
	readFilter,
	onReadFilterChange,
	isLoading,
	openedThreadIds,
	flagged,
	selected,
	onToggleSelect,
	onClearSelection,
	onSelectAll,
	onBulkArchive,
	onBulkTrash,
	onBulkRead,
	actions,
}: MailThreadListProps) {
	const scrollRef = useRef<HTMLDivElement>(null);

	const virtualizer = useVirtualizer({
		count: threads.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 8,
	});

	const empty = MAIL_FOLDER_EMPTY[folder];
	const selectionCount = selected.size;
	const isTrashOrSpam = folder === "trash" || folder === "spam";

	return (
		<TooltipProvider delayDuration={300}>
			<div className="flex h-full min-h-0 flex-col border-border/60 border-r bg-card/55 backdrop-blur-xl">
				{/* Sticky header: segment + bulk bar */}
				<div className="flex shrink-0 flex-col gap-2 border-border/50 border-b p-2">
					{selectionCount > 0 ? (
						<div className="flex items-center gap-1.5">
							<Checkbox
								checked
								onCheckedChange={onClearSelection}
								aria-label="Снять выделение"
							/>
							<span className="text-muted-foreground text-xs tabular-nums">
								Выбрано: {selectionCount}
							</span>
							<div className="ml-auto flex items-center gap-0.5">
								<BulkButton
									label="Прочитано"
									icon={MailOpen}
									onClick={onBulkRead}
								/>
								<BulkButton
									label="В архив"
									icon={Archive}
									onClick={onBulkArchive}
								/>
								<BulkButton
									label="В корзину"
									icon={Trash2}
									onClick={onBulkTrash}
								/>
							</div>
						</div>
					) : (
						<Tabs
							value={readFilter}
							onValueChange={(v) => onReadFilterChange(v as MailReadFilter)}
						>
							<TabsList className="h-7 w-full">
								<TabsTrigger value="all" className="flex-1 text-[11px]">
									Все
								</TabsTrigger>
								<TabsTrigger value="unread" className="flex-1 text-[11px]">
									Непрочитанные
								</TabsTrigger>
							</TabsList>
						</Tabs>
					)}
				</div>

				{/* Body */}
				{isLoading && threads.length === 0 ? (
					<div className="space-y-2 p-2">
						{[0, 1, 2, 3, 4].map((i) => (
							<Skeleton key={i} className="h-16 w-full" />
						))}
					</div>
				) : threads.length === 0 ? (
					<div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
						<Inbox className="mb-3 size-7 text-muted-foreground" />
						<span className="text-foreground text-sm">{empty.title}</span>
						<span className="mt-1 max-w-[15rem] text-muted-foreground text-xs">
							{empty.hint}
						</span>
					</div>
				) : (
					<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
						<div
							style={{
								height: virtualizer.getTotalSize(),
								position: "relative",
							}}
						>
							{virtualizer.getVirtualItems().map((virtualRow) => {
								const thread = threads[virtualRow.index];
								const isActive = thread.id === activeThreadId;
								const isSelected = selected.has(thread.id);
								const isStarred = Boolean(flagged[thread.id]);
								// Heuristic unread: never opened + more than the seed message.
								const isUnread =
									folder !== "trash" &&
									folder !== "spam" &&
									!openedThreadIds.has(thread.id) &&
									thread.messageCount > 1;

								return (
									<div
										key={thread.id}
										data-active={isActive || undefined}
										className={cn(
											"group absolute top-0 left-0 flex w-full items-start gap-2 border-border/40 border-b px-2 py-2.5 transition-colors hover:bg-accent/40",
											isActive && "bg-accent",
											isSelected && "bg-primary/10",
										)}
										style={{
											height: ROW_HEIGHT,
											transform: `translateY(${virtualRow.start}px)`,
										}}
									>
										{/* Select checkbox (always reachable for keyboard/mouse) */}
										<Checkbox
											checked={isSelected}
											onCheckedChange={() => onToggleSelect(thread.id)}
											aria-label="Выбрать переписку"
											className="mt-0.5 shrink-0"
										/>

										{/* Star toggle */}
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												actions.onToggleStar(thread.id);
											}}
											aria-label={
												isStarred ? "Снять отметку" : "Отметить звёздочкой"
											}
											className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-amber-400"
										>
											<Star
												className={cn(
													"size-3.5",
													isStarred && "fill-amber-400 text-amber-400",
												)}
											/>
										</button>

										{/* Main row content — opens the thread */}
										<button
											type="button"
											onClick={() => onSelect(thread.id)}
											className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
										>
											<div className="flex items-center justify-between gap-2">
												<span
													className={cn(
														"truncate text-sm",
														isUnread
															? "font-semibold text-foreground"
															: "font-medium text-foreground/90",
													)}
												>
													{thread.subjectNorm?.trim() || "(без темы)"}
												</span>
												<span className="shrink-0 text-[10px] text-muted-foreground">
													{formatListTime(thread.lastMessageAt)}
												</span>
											</div>
											<div className="flex items-center gap-1.5">
												{isUnread && (
													<span className="size-1.5 shrink-0 rounded-full bg-primary" />
												)}
												<span
													className={cn(
														"truncate text-[11px]",
														isUnread
															? "text-foreground/70"
															: "text-muted-foreground",
													)}
												>
													{thread.messageCount === 1
														? "1 сообщение"
														: `${thread.messageCount} сообщений`}
												</span>
												<Badge
													variant="outline"
													className="ml-auto h-4 shrink-0 px-1 text-[9px] tabular-nums opacity-0 transition-opacity group-hover:opacity-100"
												>
													{thread.messageCount}
												</Badge>
											</div>
										</button>

										{/* Hover actions */}
										<div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
											<RowAction
												label="Прочитано / непрочитано"
												icon={isUnread ? MailOpen : Mail}
												onClick={() => actions.onToggleRead(thread.id)}
											/>
											{isTrashOrSpam ? (
												<RowAction
													label="Вернуть во входящие"
													icon={ArchiveRestore}
													onClick={() => actions.onRestore(thread.id)}
												/>
											) : (
												<RowAction
													label="В архив"
													icon={Archive}
													onClick={() => actions.onArchive(thread.id)}
												/>
											)}
											<RowAction
												label="Удалить"
												icon={Trash2}
												onClick={() => actions.onTrash(thread.id)}
											/>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}

				{/* Footer: select-all affordance when rows exist */}
				{threads.length > 0 && (
					<div className="flex shrink-0 items-center justify-between border-border/50 border-t px-3 py-1.5">
						<button
							type="button"
							onClick={selectionCount > 0 ? onClearSelection : onSelectAll}
							className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
						>
							{selectionCount > 0 ? "Снять выделение" : "Выбрать все"}
						</button>
						<span className="text-[10px] text-muted-foreground tabular-nums">
							{threads.length}
						</span>
					</div>
				)}
			</div>
		</TooltipProvider>
	);
}

/** One hover-action icon button with a tooltip. */
function RowAction({
	label,
	icon: Icon,
	onClick,
}: {
	label: string;
	icon: typeof Archive;
	onClick: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					size="icon"
					variant="ghost"
					className="size-6"
					onClick={(e) => {
						e.stopPropagation();
						onClick();
					}}
					aria-label={label}
				>
					<Icon className="size-3.5" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

/** One bulk-bar action button with a tooltip. */
function BulkButton({
	label,
	icon: Icon,
	onClick,
}: {
	label: string;
	icon: typeof Archive;
	onClick: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					size="icon"
					variant="ghost"
					className="size-7"
					onClick={onClick}
					aria-label={label}
				>
					<Icon className="size-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
