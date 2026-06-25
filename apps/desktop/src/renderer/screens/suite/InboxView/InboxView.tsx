import { useMemo, useRef, useState } from "react";
import { DashboardSurface } from "renderer/components/DashboardSurface";
import { SuiteQueryError } from "../components/SuiteQueryError";
import { ComposeChatDialog } from "./components/ComposeChatDialog";
import { ComposeMailDialog } from "./components/ComposeMailDialog";
import { FilterRail } from "./components/FilterRail";
import { ReaderPanel } from "./components/ReaderPanel";
import { ThreadColumn } from "./components/ThreadColumn";
import { TopBar } from "./components/TopBar";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { useInboxData } from "./hooks/useInboxData";
import { useInboxKeyboard } from "./hooks/useInboxKeyboard";
import { useToggleThreadUnread } from "./hooks/useToggleThreadUnread";
import { useTriage } from "./hooks/useTriage";
import type { InboxFilter, InboxItem, InboxStatusFilter } from "./types";
import { useCommsStream } from "./useCommsStream";
import { filterInboxItems } from "./utils/filterItems";
import { flattenGrouped, stepItemIndex } from "./utils/groupRows";

const SEARCH_DEBOUNCE_MS = 280;

/**
 * The unified inbox surface (desktop) — a single notifications / triage center
 * in the Inbox-Zero idiom. Replaces the old two-tab transport switch with one
 * merged stream over `comms.*` (chat) + `mail.*` (email) — and, in a LATER
 * phase, system notifications — behind a full-width, three-panel layout:
 *
 *   ┌────────┬──────────────┬─────────────────┐
 *   │ Filter │  Thread list │     Reader      │
 *   │  rail  │ (virtualized)│ (chat/mail/sys) │
 *   └────────┴──────────────┴─────────────────┘
 *
 * Width: rendered through `DashboardSurface` in `full`/`bare` mode (NOT
 * `SuiteScreen`) so it fills the window — fixing the `max-w-5xl/6xl` collision
 * the spec calls out. Cache-first (AGENTS.md #9) throughout: cached rows render
 * immediately; SSE deliveries invalidate (never blank) the on-screen caches.
 */
export function InboxView() {
	const [filter, setFilter] = useState<InboxFilter>("all");
	const [status, setStatus] = useState<InboxStatusFilter>("all");
	const [searchInput, setSearchInput] = useState("");
	const search = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
	const [activeKey, setActiveKey] = useState<string | null>(null);
	const [composeOpen, setComposeOpen] = useState(false);
	const [composeChatOpen, setComposeChatOpen] = useState(false);

	const searchRef = useRef<HTMLInputElement>(null);
	const composerRef = useRef<HTMLTextAreaElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	const {
		items,
		totalUnread,
		systemUnread,
		isInitialLoading,
		isError,
		errorMessage,
		refetch,
	} = useInboxData();
	const triage = useTriage();
	const toggleThreadUnread = useToggleThreadUnread();

	// The visible (filtered) stream.
	const visible = useMemo(
		() =>
			filterInboxItems({
				items,
				filter,
				status,
				query: search,
				triage: {
					isArchived: triage.isArchived,
					isSnoozed: triage.isSnoozed,
				},
			}),
		[items, filter, status, search, triage.isArchived, triage.isSnoozed],
	);

	const activeItem = useMemo(
		() => visible.find((i) => i.key === activeKey) ?? null,
		[visible, activeKey],
	);

	// Live delivery: scope the open-thread refresh to the selected row's
	// transport so an SSE event refreshes the right `*.getThread` cache.
	useCommsStream({
		openThreadId: activeItem?.threadId ?? null,
		transport: activeItem?.source === "mail" ? "mail" : "chat",
	});

	const open = (item: InboxItem) => setActiveKey(item.key);

	// Keyboard triage. `j/k` step through the (grouped) visible rows; the rest
	// act on the active row. Disabled while the compose dialog is open.
	const move = (delta: 1 | -1) => {
		const rows = flattenGrouped(visible);
		const idx = stepItemIndex(rows, activeKey, delta);
		if (idx < 0) return;
		const row = rows[idx];
		if (row?.kind === "item") setActiveKey(row.item.key);
	};

	useInboxKeyboard(
		{
			onNext: () => move(1),
			onPrev: () => move(-1),
			onOpen: () => {
				if (activeItem) open(activeItem);
			},
			onClose: () => setActiveKey(null),
			onArchive: () => {
				if (activeItem) triage.archive(activeItem.key);
			},
			onSnooze: () => {
				// Snooze "tonight" via keyboard; the popover covers the other presets.
				if (activeItem) {
					const evening = new Date();
					evening.setHours(18, 0, 0, 0);
					triage.snooze(activeItem.key, evening.getTime());
				}
			},
			onDone: () => {
				if (activeItem) triage.archive(activeItem.key, "Готово");
			},
			// `u` toggles the ACTIVE thread's read-state — NOT the global
			// unread/all filter (that stays on the segment control only).
			onToggleUnread: () => toggleThreadUnread(activeItem),
			onReply: () => composerRef.current?.focus(),
			onSearch: () => searchRef.current?.focus(),
			onGoAll: () => setFilter("all"),
		},
		!composeOpen && !composeChatOpen,
	);

	if (isError) {
		return (
			<DashboardSurface title="Входящие" width="full">
				<SuiteQueryError
					message={errorMessage ?? "Не удалось загрузить входящие"}
					onRetry={refetch}
				/>
			</DashboardSurface>
		);
	}

	return (
		<DashboardSurface bare>
			<div className="flex h-full min-h-0 flex-col px-4 pt-4 pb-3">
				<div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(320px,380px)_1fr] gap-3">
					<FilterRail
						filter={filter}
						onFilterChange={setFilter}
						status={status}
						onStatusChange={setStatus}
						totalUnread={totalUnread}
						systemUnread={systemUnread}
					/>

					<div className="flex min-h-0 flex-col">
						<TopBar
							status={status}
							onStatusChange={setStatus}
							onCompose={() => setComposeOpen(true)}
							onNewChat={() => setComposeChatOpen(true)}
						/>
						<div className="min-h-0 flex-1">
							<ThreadColumn
								filter={filter}
								items={visible}
								activeKey={activeKey}
								onOpen={open}
								onArchive={(item) => triage.archive(item.key)}
								onSnooze={(item, until) => triage.snooze(item.key, until)}
								onDone={(item) => triage.archive(item.key, "Готово")}
								search={searchInput}
								onSearchChange={setSearchInput}
								searchRef={searchRef}
								scrollRef={scrollRef}
								isLoading={isInitialLoading}
							/>
						</div>
					</div>

					<ReaderPanel
						item={activeItem}
						composerRef={composerRef}
						onClose={() => setActiveKey(null)}
						onArchive={(item) => {
							triage.archive(item.key);
							setActiveKey(null);
						}}
						onSnooze={(item, until) => {
							triage.snooze(item.key, until);
							setActiveKey(null);
						}}
						onDone={(item) => {
							triage.archive(item.key, "Готово");
							setActiveKey(null);
						}}
					/>
				</div>
			</div>

			<ComposeMailDialog open={composeOpen} onOpenChange={setComposeOpen} />
			<ComposeChatDialog
				open={composeChatOpen}
				onOpenChange={setComposeChatOpen}
				onThreadCreated={(threadId) => setActiveKey(`chat:${threadId}`)}
			/>
		</DashboardSurface>
	);
}
