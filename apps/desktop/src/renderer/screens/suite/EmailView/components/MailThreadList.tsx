import { Input } from "@rox/ui/input";
import { Skeleton } from "@rox/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@rox/ui/tabs";
import { cn } from "@rox/ui/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Inbox, Search } from "lucide-react";
import { useRef } from "react";
import { MAIL_FOLDER_EMPTY } from "../lib/mailFolders";
import { formatListTime } from "../lib/mailFormat";
import type { MailFolderId, MailThreadSummary } from "../lib/mailTypes";

/** Fixed row height (px) used for virtual measurement; rows clamp to this. */
const ROW_HEIGHT = 64;

export type MailReadFilter = "all" | "unread";

export interface MailThreadListProps {
	folder: MailFolderId;
	threads: MailThreadSummary[];
	activeThreadId: string | null;
	onSelect: (id: string) => void;
	search: string;
	onSearchChange: (value: string) => void;
	readFilter: MailReadFilter;
	onReadFilterChange: (value: MailReadFilter) => void;
	isLoading: boolean;
	/** Ref so the keyboard layer can focus the search box on `/`. */
	searchRef?: React.RefObject<HTMLInputElement | null>;
}

/**
 * Panel 2 — the virtualized thread list. `@tanstack/react-virtual` keeps the
 * DOM light for a large mailbox (the prior hard `limit 50` flat list is gone).
 * A sticky header carries the debounced search box (client filter in P0) and an
 * Все/Непрочитанные segment. Rows show subject, message count, and time;
 * selecting one opens it in the reader.
 *
 * Glass: `bg-card/55 backdrop-blur` panel; active row `bg-accent`, hover
 * `bg-accent/40`.
 */
export function MailThreadList({
	folder,
	threads,
	activeThreadId,
	onSelect,
	search,
	onSearchChange,
	readFilter,
	onReadFilterChange,
	isLoading,
	searchRef,
}: MailThreadListProps) {
	const scrollRef = useRef<HTMLDivElement>(null);

	const virtualizer = useVirtualizer({
		count: threads.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 8,
	});

	const empty = MAIL_FOLDER_EMPTY[folder];

	return (
		<div className="flex h-full min-h-0 flex-col border-border/60 border-r bg-card/55 backdrop-blur-xl">
			{/* Sticky header: search + segment */}
			<div className="flex shrink-0 flex-col gap-2 border-border/50 border-b p-2">
				<div className="relative">
					<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
					<Input
						ref={searchRef}
						value={search}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="Поиск писем…"
						className="h-8 pl-8 text-xs"
						aria-label="Поиск писем"
					/>
				</div>
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
			</div>

			{/* Body */}
			{isLoading && threads.length === 0 ? (
				<div className="space-y-2 p-2">
					{[0, 1, 2, 3, 4].map((i) => (
						<Skeleton key={i} className="h-14 w-full" />
					))}
				</div>
			) : threads.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
					<Inbox className="mb-3 size-7 text-muted-foreground" />
					<span className="text-foreground text-sm">
						{search.trim() ? "Ничего не найдено" : empty.title}
					</span>
					<span className="mt-1 max-w-[15rem] text-muted-foreground text-xs">
						{search.trim() ? "Измените запрос или очистите поиск." : empty.hint}
					</span>
				</div>
			) : (
				<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
					<div
						style={{ height: virtualizer.getTotalSize(), position: "relative" }}
					>
						{virtualizer.getVirtualItems().map((virtualRow) => {
							const thread = threads[virtualRow.index];
							const isActive = thread.id === activeThreadId;
							return (
								<button
									key={thread.id}
									type="button"
									onClick={() => onSelect(thread.id)}
									data-active={isActive || undefined}
									className={cn(
										"absolute top-0 left-0 flex w-full flex-col gap-0.5 border-border/40 border-b px-3 py-2.5 text-left transition-colors hover:bg-accent/40",
										isActive && "bg-accent",
									)}
									style={{
										height: ROW_HEIGHT,
										transform: `translateY(${virtualRow.start}px)`,
									}}
								>
									<div className="flex items-center justify-between gap-2">
										<span className="truncate font-medium text-sm">
											{thread.subjectNorm?.trim() || "(без темы)"}
										</span>
										<span className="shrink-0 text-[10px] text-muted-foreground">
											{formatListTime(thread.lastMessageAt)}
										</span>
									</div>
									<span className="truncate text-[11px] text-muted-foreground">
										{thread.messageCount === 1
											? "1 сообщение"
											: `${thread.messageCount} сообщений`}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
