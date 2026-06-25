import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import {
	groupSessionsByAge,
	type SessionAgeGroup,
	type SessionAgeGroupKey,
} from "@rox/ui/session-row";
import { useEffect, useMemo, useState } from "react";
import {
	HiMiniArrowPath,
	HiMiniChevronDown,
	HiMiniPlus,
} from "react-icons/hi2";
import { getRelativeTime } from "../../../../../../../WorkspacesListView/utils";
import { SessionSelectorItem } from "./components/SessionSelectorItem";

interface SessionItem {
	sessionId: string;
	title: string;
	updatedAt: Date;
}

interface SessionSelectorProps {
	currentSessionId: string | null;
	sessions: SessionItem[];
	fallbackTitle?: string;
	isSessionInitializing?: boolean;
	onSelectSession: (sessionId: string) => void;
	onNewChat: () => Promise<void>;
	onDeleteSession: (sessionId: string) => Promise<void>;
}

const SESSION_PAGE_SIZE = 20;

// Localized headers for the shared `groupSessionsByAge` keys (F18); `older`
// renders a relative label from its bucket timestamp.
const GROUP_LABELS: Record<Exclude<SessionAgeGroupKey, "older">, string> = {
	today: "Today",
	yesterday: "Yesterday",
	last7Days: "Last 7 days",
	last30Days: "Last 30 days",
};

function sessionGroupLabel(group: SessionAgeGroup<SessionItem>): string {
	if (group.key === "older") {
		return group.olderAt !== null ? getRelativeTime(group.olderAt) : "Older";
	}
	return GROUP_LABELS[group.key];
}

export function SessionSelector({
	currentSessionId,
	sessions,
	fallbackTitle,
	isSessionInitializing = false,
	onSelectSession,
	onNewChat,
	onDeleteSession,
}: SessionSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [visibleCount, setVisibleCount] = useState(SESSION_PAGE_SIZE);

	const visibleSessions = useMemo(
		() => sessions.slice(0, visibleCount),
		[sessions, visibleCount],
	);
	const groupedSessions = useMemo(
		() => groupSessionsByAge(visibleSessions, new Date()),
		[visibleSessions],
	);
	const hasMoreSessions = sessions.length > visibleCount;

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
	const resolvedFallbackTitle =
		fallbackTitle && fallbackTitle !== "New Chat" ? fallbackTitle : null;
	const currentTitle =
		current?.title ||
		resolvedFallbackTitle ||
		(isSessionInitializing ? "Creating Chat" : "New Chat");

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-busy={isSessionInitializing}
					className="flex w-full min-w-0 flex-1 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<HiMiniChevronDown className="size-3" />
					<span className="min-w-0 flex-1 truncate text-left">
						{currentTitle}
					</span>
					{isSessionInitializing && (
						<HiMiniArrowPath className="size-3 animate-spin" />
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-80">
				<DropdownMenuLabel className="text-xs">Сессии</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<div className="max-h-80 overflow-y-auto">
					{sessions.length > 0 ? (
						<>
							{groupedSessions.map((group, index) => (
								<div
									key={`${group.key}-${group.sessions[0]?.sessionId ?? index}`}
									className={
										index > 0 ? "mt-1 border-t border-border/50 pt-1" : ""
									}
								>
									<div className="px-2 py-1 text-xs text-muted-foreground">
										{sessionGroupLabel(group)}
									</div>
									{group.sessions.map((session) => (
										<SessionSelectorItem
											key={session.sessionId}
											sessionId={session.sessionId}
											title={session.title}
											isCurrent={session.sessionId === currentSessionId}
											onSelectSession={(sessionId) => {
												onSelectSession(sessionId);
												setIsOpen(false);
											}}
											onDeleteSession={onDeleteSession}
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
										Show more sessions
									</button>
								</div>
							)}
						</>
					) : (
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							No sessions yet
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
					<span className="text-xs">Новый чат</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
