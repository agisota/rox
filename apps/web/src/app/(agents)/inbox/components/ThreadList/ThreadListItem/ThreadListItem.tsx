"use client";

import { formatThreadTitle } from "../../../utils/formatThreadTitle";

export interface ThreadListItemProps {
	id: string;
	subject: string | null;
	lastMessageAt: Date | string | null;
	isActive: boolean;
	onSelect: (threadId: string) => void;
}

/** Relative-ish short timestamp for the inbox row. */
function formatStamp(value: Date | string | null): string {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const now = new Date();
	const sameDay = date.toDateString() === now.toDateString();
	return sameDay
		? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
		: date.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
}

/** A single inbox row: title + last-activity stamp, highlighted when active. */
export function ThreadListItem({
	id,
	subject,
	lastMessageAt,
	isActive,
	onSelect,
}: ThreadListItemProps) {
	return (
		<button
			type="button"
			onClick={() => onSelect(id)}
			aria-current={isActive}
			className={`flex w-full flex-col gap-0.5 border-b px-3 py-2.5 text-left transition-colors hover:bg-accent/60 ${
				isActive ? "bg-accent" : ""
			}`}
		>
			<div className="flex w-full items-center gap-2">
				<span className="flex-1 truncate text-sm font-medium">
					{formatThreadTitle({ subject, id })}
				</span>
				<span className="shrink-0 text-[10px] text-muted-foreground">
					{formatStamp(lastMessageAt)}
				</span>
			</div>
		</button>
	);
}
