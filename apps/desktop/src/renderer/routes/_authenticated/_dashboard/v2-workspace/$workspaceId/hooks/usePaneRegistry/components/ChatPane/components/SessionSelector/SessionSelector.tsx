import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { useEffect, useMemo, useState } from "react";
import { HiMiniChevronDown, HiMiniPlus } from "react-icons/hi2";
import { getRelativeTime } from "renderer/screens/main/components/WorkspacesListView/utils";
import { SessionSelectorItem } from "./components/SessionSelectorItem";
import { selectPinnedSessions } from "./utils/selectPinnedSessions/selectPinnedSessions";

interface SessionItem {
	sessionId: string;
	title: string;
	updatedAt: Date;
	pinned: boolean;
	pinnedAt: Date | null;
}

interface SessionSelectorProps {
	currentSessionId: string | null;
	sessions: SessionItem[];
	fallbackTitle?: string;
	onSelectSession: (sessionId: string) => void;
	onNewChat: () => Promise<void>;
	onDeleteSession: (sessionId: string) => Promise<void>;
	onSetPinned: (sessionId: string, pinned: boolean) => Promise<void>;
}

interface SessionGroup {
	label: string;
	sessions: SessionItem[];
}

const SESSION_PAGE_SIZE = 20;
// Sticky-top pinned group is capped so a runaway pin list can't crowd out the
// time-grouped history. Excess pinned sessions still appear in their time group.
const PINNED_GROUP_CAP = 10;
const PINNED_GROUP_LABEL = "★ Закреплённые";
const NEW_CHAT_LABEL = "Новый чат";

function toSessionGroupLabel(updatedAt: Date): string {
	const startOfToday = new Date();
	startOfToday.setHours(0, 0, 0, 0);

	const startOfYesterday = new Date(startOfToday);
	startOfYesterday.setDate(startOfYesterday.getDate() - 1);

	const startOfLastWeek = new Date(startOfToday);
	startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

	const startOfLastMonth = new Date(startOfToday);
	startOfLastMonth.setDate(startOfLastMonth.getDate() - 30);

	if (updatedAt >= startOfToday) return "Сегодня";
	if (updatedAt >= startOfYesterday) return "Вчера";
	if (updatedAt >= startOfLastWeek) return "Последние 7 дней";
	if (updatedAt >= startOfLastMonth) return "Последние 30 дней";
	return getRelativeTime(updatedAt.getTime());
}

function groupSessionsByAge(sessions: SessionItem[]): SessionGroup[] {
	const groups: SessionGroup[] = [];

	for (const session of sessions) {
		const label = toSessionGroupLabel(session.updatedAt);
		const lastGroup = groups[groups.length - 1];

		if (lastGroup?.label === label) {
			lastGroup.sessions.push(session);
			continue;
		}

		groups.push({ label, sessions: [session] });
	}

	return groups;
}

export function SessionSelector({
	currentSessionId,
	sessions,
	fallbackTitle,
	onSelectSession,
	onNewChat,
	onDeleteSession,
	onSetPinned,
}: SessionSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [visibleCount, setVisibleCount] = useState(SESSION_PAGE_SIZE);

	// Sticky-top pinned group (capped) ahead of the time-grouped list; `rest`
	// excludes whatever's shown in the pinned group so no chat renders twice.
	const { pinned: pinnedSessions, rest: unpinnedSessions } = useMemo(
		() => selectPinnedSessions(sessions, PINNED_GROUP_CAP),
		[sessions],
	);

	const visibleSessions = useMemo(
		() => unpinnedSessions.slice(0, visibleCount),
		[unpinnedSessions, visibleCount],
	);
	const groupedSessions = useMemo(
		() => groupSessionsByAge(visibleSessions),
		[visibleSessions],
	);
	const hasMoreSessions = unpinnedSessions.length > visibleCount;

	useEffect(() => {
		if (!isOpen) return;
		setVisibleCount(SESSION_PAGE_SIZE);
	}, [isOpen]);

	const loadMoreSessions = () => {
		setVisibleCount((count) =>
			Math.min(count + SESSION_PAGE_SIZE, sessions.length),
		);
	};

	const current = sessions.find(
		(session) => session.sessionId === currentSessionId,
	);
	// Treat the legacy "New Chat" sentinel (still passed by ChatPaneTitle) and
	// its RU equivalent as "no real title yet" so the placeholder shows instead.
	const isPlaceholderFallback =
		!fallbackTitle ||
		fallbackTitle === "New Chat" ||
		fallbackTitle === NEW_CHAT_LABEL;
	const resolvedFallbackTitle = isPlaceholderFallback ? null : fallbackTitle;
	const currentTitle =
		current?.title || resolvedFallbackTitle || NEW_CHAT_LABEL;

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					title={currentTitle}
					className="flex w-full min-w-0 flex-1 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<HiMiniChevronDown className="size-3 shrink-0" />
					<span className="min-w-0 flex-1 truncate text-left">
						{currentTitle}
					</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-80">
				<DropdownMenuLabel className="text-xs">Сессии</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<div className="max-h-80 overflow-y-auto">
					{sessions.length > 0 ? (
						<>
							{pinnedSessions.length > 0 && (
								<div>
									<div className="px-2 py-1 text-xs text-muted-foreground">
										{PINNED_GROUP_LABEL}
									</div>
									{pinnedSessions.map((session) => (
										<SessionSelectorItem
											key={session.sessionId}
											sessionId={session.sessionId}
											title={session.title}
											isCurrent={session.sessionId === currentSessionId}
											pinned={session.pinned}
											onSelectSession={(sessionId) => {
												onSelectSession(sessionId);
												setIsOpen(false);
											}}
											onDeleteSession={onDeleteSession}
											onSetPinned={onSetPinned}
										/>
									))}
								</div>
							)}
							{groupedSessions.map((group, index) => (
								<div
									key={`${group.label}-${group.sessions[0]?.sessionId ?? index}`}
									className={
										index > 0 || pinnedSessions.length > 0
											? "mt-1 border-t border-border/50 pt-1"
											: ""
									}
								>
									<div className="px-2 py-1 text-xs text-muted-foreground">
										{group.label}
									</div>
									{group.sessions.map((session) => (
										<SessionSelectorItem
											key={session.sessionId}
											sessionId={session.sessionId}
											title={session.title}
											isCurrent={session.sessionId === currentSessionId}
											pinned={session.pinned}
											onSelectSession={(sessionId) => {
												onSelectSession(sessionId);
												setIsOpen(false);
											}}
											onDeleteSession={onDeleteSession}
											onSetPinned={onSetPinned}
										/>
									))}
								</div>
							))}
							{hasMoreSessions && (
								<div className="px-2 py-1.5">
									<button
										type="button"
										className="w-full rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
										onClick={loadMoreSessions}
									>
										Показать ещё
									</button>
								</div>
							)}
						</>
					) : (
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							Пока нет сессий
						</div>
					)}
				</div>

				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={() => {
						void onNewChat();
						setIsOpen(false);
					}}
				>
					<HiMiniPlus className="mr-1.5 size-3.5" />
					<span className="text-xs">{NEW_CHAT_LABEL}</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
