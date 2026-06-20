"use client";

export interface MailThreadListItemProps {
	id: string;
	subject: string | null;
	lastMessageAt: Date | string;
	messageCount: number;
	isActive: boolean;
	onSelect: (threadId: string) => void;
}

/** Compact relative-ish timestamp for the inbox row (date or time). */
function formatListTime(value: Date | string): string {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const now = new Date();
	const sameDay = date.toDateString() === now.toDateString();
	return sameDay
		? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
		: date.toLocaleDateString([], { day: "2-digit", month: "short" });
}

/**
 * One mailbox thread in the list. Mail threads carry a normalized subject + a
 * last-activity timestamp + a message count (per-message sender/unread state
 * lives inside the thread, surfaced once opened). Selecting highlights the row.
 */
export function MailThreadListItem({
	id,
	subject,
	lastMessageAt,
	messageCount,
	isActive,
	onSelect,
}: MailThreadListItemProps) {
	return (
		<button
			type="button"
			onClick={() => onSelect(id)}
			className={`flex w-full flex-col gap-0.5 border-b px-3 py-2.5 text-left transition-colors hover:bg-accent ${
				isActive ? "bg-accent" : ""
			}`}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="truncate text-sm font-medium">
					{subject?.trim() || "(без темы)"}
				</span>
				<span className="shrink-0 text-[10px] text-muted-foreground">
					{formatListTime(lastMessageAt)}
				</span>
			</div>
			<span className="text-[11px] text-muted-foreground">
				{messageCount === 1 ? "1 сообщение" : `${messageCount} сообщений`}
			</span>
		</button>
	);
}
