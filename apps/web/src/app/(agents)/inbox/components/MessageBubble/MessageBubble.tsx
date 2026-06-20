"use client";

import { AttachmentChip } from "../AttachmentChip";

/** Minimal message shape the bubble renders (subset of a comms message row). */
export interface BubbleMessage {
	id: string;
	body: string;
	authorUserId: string | null;
	createdAt: Date | string;
	attachments?: { name: string; url: string; size?: number }[];
}

export interface MessageBubbleProps {
	message: BubbleMessage;
	/** The viewer's user id — decides own (right) vs other (left) alignment. */
	currentUserId: string | undefined;
	/** Display name for the author (resolved by the parent from participants). */
	authorName: string;
}

/** Locale time for the message timestamp. */
function formatTime(value: Date | string): string {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * A single chat message bubble. Own messages align right with the primary tint;
 * others align left. Attachments render as download chips beneath the body.
 */
export function MessageBubble({
	message,
	currentUserId,
	authorName,
}: MessageBubbleProps) {
	const isOwn =
		Boolean(currentUserId) && message.authorUserId === currentUserId;
	const attachments = message.attachments ?? [];

	return (
		<div className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
			{!isOwn && (
				<span className="mb-0.5 px-1 text-[11px] font-medium text-muted-foreground">
					{authorName}
				</span>
			)}
			<div
				className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
					isOwn
						? "rounded-br-sm bg-primary text-primary-foreground"
						: "rounded-bl-sm bg-secondary text-secondary-foreground"
				}`}
			>
				{message.body && (
					<p className="whitespace-pre-wrap break-words">{message.body}</p>
				)}
				{attachments.length > 0 && (
					<div className="mt-1.5 flex flex-wrap gap-1.5">
						{attachments.map((att) => (
							<AttachmentChip
								key={`${message.id}-${att.url}`}
								name={att.name}
								size={att.size ?? 0}
								url={att.url}
							/>
						))}
					</div>
				)}
			</div>
			<span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
				{formatTime(message.createdAt)}
			</span>
		</div>
	);
}
