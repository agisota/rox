import { Input } from "@rox/ui/input";
import { ScrollArea } from "@rox/ui/scroll-area";
import { Skeleton } from "@rox/ui/skeleton";
import { cn } from "@rox/ui/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Inbox, Search } from "lucide-react";
import { type RefObject, useMemo } from "react";
import type { InboxFilter, InboxItem } from "../types";
import { type FlatRow, flattenGrouped } from "../utils/groupRows";
import { DATE_GROUP_LABEL } from "../utils/inboxTime";
import { GLASS_PANEL } from "./glass";
import { ThreadRow } from "./ThreadRow";

const ITEM_HEIGHT = 66;
const HEADER_HEIGHT = 30;

/** RU empty-state copy per filter (per the surface spec's per-filter empties). */
const EMPTY_COPY: Record<InboxFilter, { title: string; hint: string }> = {
	all: {
		title: "Входящие пусты",
		hint: "Здесь появятся ваши чаты, письма и уведомления.",
	},
	chat: {
		title: "Переписок пока нет",
		hint: "Когда вы начнёте переписку, она появится здесь.",
	},
	mail: {
		title: "Входящих нет",
		hint: "Когда придут письма, они появятся здесь.",
	},
	system: {
		title: "Уведомлений нет",
		hint: "Здесь появятся события PR, проверок, автоматизаций и агентов.",
	},
	snoozed: {
		title: "Нет отложенных",
		hint: "Отложите тред клавишей «s», чтобы вернуться к нему позже.",
	},
	archive: { title: "Архив пуст", hint: "Обработанные треды переедут сюда." },
};

export interface ThreadColumnProps {
	filter: InboxFilter;
	items: InboxItem[];
	activeKey: string | null;
	onOpen: (item: InboxItem) => void;
	onArchive: (item: InboxItem) => void;
	onSnooze: (item: InboxItem, until: number) => void;
	onDone: (item: InboxItem) => void;
	search: string;
	onSearchChange: (value: string) => void;
	searchRef: RefObject<HTMLInputElement | null>;
	scrollRef: RefObject<HTMLDivElement | null>;
	isLoading: boolean;
}

/**
 * Panel 2 — the virtualized thread list. A debounced search box sits in a sticky
 * header; below it the merged stream renders through `@tanstack/react-virtual`
 * (headers + rows flattened into one window) with sticky "Сегодня / Вчера /
 * Ранее" group headers. Selecting a row opens it in the reader.
 */
export function ThreadColumn({
	filter,
	items,
	activeKey,
	onOpen,
	onArchive,
	onSnooze,
	onDone,
	search,
	onSearchChange,
	searchRef,
	scrollRef,
	isLoading,
}: ThreadColumnProps) {
	const rows = useMemo<FlatRow[]>(() => flattenGrouped(items), [items]);
	// Radix `ScrollArea` scrolls on its inner Viewport, NOT its Root (which is
	// where `ref` lands). The virtualizer must observe the viewport, so resolve
	// it from the root via its stable `data-slot` — otherwise scroll events never
	// reach the virtualizer and rows do not recycle.
	const getViewport = () =>
		scrollRef.current?.querySelector<HTMLElement>(
			'[data-slot="scroll-area-viewport"]',
		) ?? null;

	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: getViewport,
		estimateSize: (i) =>
			rows[i]?.kind === "header" ? HEADER_HEIGHT : ITEM_HEIGHT,
		overscan: 10,
	});

	const empty = EMPTY_COPY[filter];
	const searching = search.trim().length > 0;

	return (
		<div className={cn(GLASS_PANEL, "flex h-full min-h-0 flex-col")}>
			{/* Sticky search header */}
			<div className="shrink-0 border-white/5 border-b p-2">
				<div className="relative">
					<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
					<Input
						ref={searchRef}
						value={search}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="Поиск во входящих…"
						className="h-8 pl-8 text-xs"
						aria-label="Поиск во входящих"
					/>
				</div>
			</div>

			{isLoading && items.length === 0 ? (
				<div className="space-y-2 p-2">
					{[0, 1, 2, 3, 4].map((i) => (
						<Skeleton key={i} className="h-14 w-full" />
					))}
				</div>
			) : items.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
					<Inbox className="mb-3 size-7 text-muted-foreground" />
					<span className="text-foreground text-sm">
						{searching ? "Ничего не найдено" : empty.title}
					</span>
					<span className="mt-1 max-w-[15rem] text-muted-foreground text-xs">
						{searching ? "Измените запрос или очистите поиск." : empty.hint}
					</span>
				</div>
			) : (
				<ScrollArea ref={scrollRef} className="min-h-0 flex-1">
					<div
						style={{ height: virtualizer.getTotalSize(), position: "relative" }}
					>
						{virtualizer.getVirtualItems().map((vRow) => {
							const row = rows[vRow.index];
							if (!row) return null;
							const style = {
								position: "absolute" as const,
								top: 0,
								left: 0,
								width: "100%",
								transform: `translateY(${vRow.start}px)`,
							};
							if (row.kind === "header") {
								return (
									<div
										key={row.id}
										style={style}
										className="flex items-center bg-card/80 px-3 py-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wide backdrop-blur"
									>
										{DATE_GROUP_LABEL[row.group]}
									</div>
								);
							}
							return (
								<div key={row.id} style={style}>
									<ThreadRow
										item={row.item}
										active={row.item.key === activeKey}
										onOpen={() => onOpen(row.item)}
										onArchive={() => onArchive(row.item)}
										onSnooze={(until) => onSnooze(row.item, until)}
										onDone={() => onDone(row.item)}
									/>
								</div>
							);
						})}
					</div>
				</ScrollArea>
			)}
		</div>
	);
}
