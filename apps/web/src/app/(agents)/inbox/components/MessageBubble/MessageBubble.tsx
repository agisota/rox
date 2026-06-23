"use client";

import { Pencil, Trash2 } from "lucide-react";

import { AttachmentChip } from "../AttachmentChip";

/** Minimal message shape the bubble renders (subset of a comms message row). */
export interface BubbleMessage {
	id: string;
	body: string;
	authorUserId: string | null;
	createdAt: Date | string;
	/** Last edit time (T8/M); when set, an "(изменено)" marker shows. */
	editedAt?: Date | string | null;
	/** Soft-delete tombstone (T8/M); when set, the body is replaced by a marker. */
	deletedAt?: Date | string | null;
	attachments?: { name: string; url: string; size?: number }[];
}

export interface MessageBubbleProps {
	message: BubbleMessage;
	/** The viewer's user id — decides own (right) vs other (left) alignment. */
	currentUserId: string | undefined;
	/** Display name for the author (resolved by the parent from participants). */
	authorName: string;
	/** Edit affordance — wired only for the author's own, non-deleted messages. */
	onEdit?: (id: string) => void;
	/** Delete affordance — wired only for the author's own, non-deleted messages. */
	onDelete?: (id: string) => void;
}

/** Locale time for the message timestamp. */
function formatTime(value: Date | string): string {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * A single chat message bubble. Own messages align right with the primary tint;
 * others align left. A deleted message renders a muted tombstone instead of its
 * body/attachments; an edited message shows an "(изменено)" marker by the time.
 * The author sees hover edit/delete affordances on their own, live messages.
 */
export function MessageBubble({
	message,
	currentUserId,
	authorName,
	onEdit,
	onDelete,
}: MessageBubbleProps) {
	const isOwn =
		Boolean(currentUserId) && message.authorUserId === currentUserId;
	const isDeleted = Boolean(message.deletedAt);
	const isEdited = Boolean(message.editedAt);
	const attachments = isDeleted ? [] : (message.attachments ?? []);
	// Affordances only for the author's own, non-deleted messages.
	const showActions =
		isOwn && !isDeleted && (Boolean(onEdit) || Boolean(onDelete));

	return (
		<div
			className={`group flex flex-col ${isOwn ? "items-end" : "items-start"}`}
		>
			{!isOwn && (
				<span className="mb-0.5 px-1 text-[11px] font-medium text-muted-foreground">
					{authorName}
				</span>
			)}
			<div className="flex items-center gap-1">
				{showActions && (
					<div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
						{onEdit && (
							<button
								type="button"
								aria-label="Изменить"
								onClick={() => onEdit(message.id)}
								className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
							>
								<Pencil className="size-3.5" />
							</button>
						)}
						{onDelete && (
							<button
								type="button"
								aria-label="Удалить"
								onClick={() => onDelete(message.id)}
								className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
							>
								<Trash2 className="size-3.5" />
							</button>
						)}
					</div>
				)}
				<div
					className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
						isOwn
							? "rounded-br-sm bg-primary text-primary-foreground"
							: "rounded-bl-sm bg-secondary text-secondary-foreground"
					}`}
				>
					{isDeleted ? (
						<p className="italic text-muted-foreground">Сообщение удалено</p>
					) : (
						<>
							{message.body && (
								<p className="whitespace-pre-wrap break-words">
									{message.body}
								</p>
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
						</>
					)}
				</div>
			</div>
			<span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
				{formatTime(message.createdAt)}
				{!isDeleted && isEdited && " · изменено"}
			</span>
		</div>
	);
}
