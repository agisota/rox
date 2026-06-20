"use client";

import { Badge } from "@rox/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Paperclip } from "lucide-react";

import { useTRPC } from "@/trpc/react";
import {
	formatMailParticipant,
	mailParticipantInitial,
} from "../../../utils/formatMailParticipant";
import type { MailThreadMessage } from "../../../utils/mailReplyContext";

export interface MailMessageCardProps {
	message: MailThreadMessage;
	/** Expanded cards fetch + show attachment metadata via `mail.getMessage`. */
	expanded: boolean;
	onToggle: (messageId: string) => void;
}

/** Human-readable byte size for an attachment row. */
function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: Date | string | null | undefined): string {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString([], {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * A single email message in the thread view.
 *
 * Bodies live in R2 (the router returns pointers, not inline content), so the
 * card renders the server-trimmed `snippet` as PLAIN TEXT — never injected HTML —
 * which is inherently XSS-safe (React escapes text children; no
 * `dangerouslySetInnerHTML`). When expanded, attachment metadata is loaded via
 * `mail.getMessage`; the underlying file objects are R2-backed and not yet
 * presigned by this router, so each attachment is shown as inert metadata.
 */
export function MailMessageCard({
	message,
	expanded,
	onToggle,
}: MailMessageCardProps) {
	const trpc = useTRPC();
	const isOutbound = message.direction === "outbound";
	const senderLabel = isOutbound
		? "Вы"
		: formatMailParticipant({
				fromAddr: message.fromAddr,
				fromName: message.fromName,
			});

	const detail = useQuery({
		...trpc.mail.getMessage.queryOptions({ messageId: message.id }),
		enabled: expanded && message.hasAttachments,
	});
	const attachments = detail.data?.attachments ?? [];

	const timestamp =
		message.receivedAt ?? message.sentAt ?? message.createdAt ?? null;

	return (
		<div className="rounded-lg border bg-card">
			<button
				type="button"
				onClick={() => onToggle(message.id)}
				className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
			>
				<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
					{mailParticipantInitial(senderLabel)}
				</span>
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="flex items-center gap-2">
						<span className="truncate text-sm font-medium">{senderLabel}</span>
						<Badge
							variant="outline"
							className="shrink-0 gap-1 px-1.5 py-0 text-[10px]"
						>
							{isOutbound ? (
								<ArrowUpRight className="size-2.5" />
							) : (
								<ArrowDownLeft className="size-2.5" />
							)}
							{isOutbound ? "Исходящее" : "Входящее"}
						</Badge>
						{!message.isRead && !isOutbound && (
							<span className="size-1.5 shrink-0 rounded-full bg-primary" />
						)}
					</span>
					<span className="truncate text-[11px] text-muted-foreground">
						{message.subject?.trim() || "(без темы)"}
					</span>
					{!expanded && message.snippet && (
						<span className="truncate text-xs text-muted-foreground">
							{message.snippet}
						</span>
					)}
				</span>
				<span className="shrink-0 text-[10px] text-muted-foreground">
					{formatDateTime(timestamp)}
				</span>
			</button>

			{expanded && (
				<div className="border-t px-3 py-3">
					<dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
						<dt className="font-medium">От</dt>
						<dd className="truncate">{message.fromAddr ?? "—"}</dd>
						<dt className="font-medium">Кому</dt>
						<dd className="truncate">{message.toAddrs?.join(", ") || "—"}</dd>
					</dl>

					{/* Body lives in R2 — render the safe plaintext snippet (no raw HTML). */}
					<p className="whitespace-pre-wrap break-words text-sm">
						{message.snippet?.trim() ||
							"Текст письма недоступен в предпросмотре."}
					</p>

					{message.hasAttachments && (
						<div className="mt-3 flex flex-col gap-1.5">
							<span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
								<Paperclip className="size-3" /> Вложения
							</span>
							{detail.isLoading ? (
								<span className="text-xs text-muted-foreground">
									Загрузка вложений…
								</span>
							) : attachments.length === 0 ? (
								<span className="text-xs text-muted-foreground">
									Вложения недоступны.
								</span>
							) : (
								attachments.map((att) => (
									<span
										key={att.id}
										className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1"
										title={`${att.contentType} · хранится в Drive`}
									>
										<Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
										<span className="truncate text-xs font-medium">
											{att.filename}
										</span>
										<span className="shrink-0 text-[10px] text-muted-foreground">
											{formatSize(att.sizeBytes)}
										</span>
									</span>
								))
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
