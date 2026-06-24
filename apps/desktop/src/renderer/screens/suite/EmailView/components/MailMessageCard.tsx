import { Badge } from "@rox/ui/badge";
import { AnimatedHeight } from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	ArrowDownLeft,
	ArrowUpRight,
	ChevronDown,
	Download,
	Paperclip,
} from "lucide-react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";
import {
	formatDateTime,
	formatMailParticipant,
	formatSize,
	mailParticipantInitial,
} from "../lib/mailFormat";
import type { MailThreadMessage } from "../lib/mailTypes";
import { useMailBody } from "../useMailBody";
import { MailHtmlContent } from "./MailHtmlContent";

export interface MailMessageCardProps {
	message: MailThreadMessage;
	/** Expanded cards fetch the full body + attachment metadata. */
	expanded: boolean;
	onToggle: (messageId: string) => void;
}

/**
 * One email message in the thread reader. Collapsed it shows sender + snippet +
 * time; expanded (animated via `AnimatedHeight`) it fetches the FULL body from
 * R2 and renders it safely — HTML through {@link MailHtmlContent} (sandboxed
 * iframe + DOMPurify + blocked remote images), text as escaped `pre-wrap`. The
 * server-trimmed `snippet` is the loading/error fallback. Attachments are
 * downloaded via a short-TTL presigned `mail.getAttachmentUrl`.
 *
 * Cache-first (AGENTS.md #9): a cached body renders instantly while a refetch
 * runs; a presign error degrades to the snippet rather than blanking.
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

	const bodyQuery = useMailBody(message.id, expanded);

	const attachmentUrl = useMutation(
		trpc.mail.getAttachmentUrl.mutationOptions({
			onSuccess: ({ url }) => {
				window.open(url, "_blank", "noopener,noreferrer");
			},
			onError: (error) => {
				logger.error("[MailMessageCard] attachment presign failed", error);
			},
		}),
	);

	const timestamp =
		message.receivedAt ?? message.sentAt ?? message.createdAt ?? null;

	return (
		<div
			className={cn(
				"overflow-hidden rounded-lg border border-border/70 bg-card/80",
				expanded && "bg-card",
			)}
		>
			<button
				type="button"
				onClick={() => onToggle(message.id)}
				aria-expanded={expanded}
				className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
			>
				<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground text-xs">
					{mailParticipantInitial(senderLabel)}
				</span>
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="flex items-center gap-2">
						<span className="truncate font-medium text-sm">{senderLabel}</span>
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
					{!expanded && (
						<span className="truncate text-muted-foreground text-xs">
							{message.snippet?.trim() ||
								message.subject?.trim() ||
								"(без темы)"}
						</span>
					)}
				</span>
				<span className="flex shrink-0 items-center gap-1.5">
					<span className="text-[10px] text-muted-foreground">
						{formatDateTime(timestamp)}
					</span>
					<ChevronDown
						className={cn(
							"size-3.5 text-muted-foreground transition-transform",
							expanded && "rotate-180",
						)}
					/>
				</span>
			</button>

			<AnimatedHeight open={expanded}>
				<div className="border-border/70 border-t px-3 py-3">
					<dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
						<dt className="font-medium">От</dt>
						<dd className="truncate font-mono">{message.fromAddr ?? "—"}</dd>
						<dt className="font-medium">Кому</dt>
						<dd className="truncate font-mono">
							{message.toAddrs?.join(", ") || "—"}
						</dd>
						{message.subject?.trim() && (
							<>
								<dt className="font-medium">Тема</dt>
								<dd className="truncate">{message.subject}</dd>
							</>
						)}
					</dl>

					{bodyQuery.isLoading ? (
						<p className="cursor-text select-text whitespace-pre-wrap break-words text-muted-foreground text-sm">
							Загрузка письма…
						</p>
					) : bodyQuery.data?.kind === "html" ? (
						<MailHtmlContent
							html={bodyQuery.data.content}
							subject={message.subject}
						/>
					) : (
						<p className="cursor-text select-text whitespace-pre-wrap break-words font-mono text-sm">
							{bodyQuery.data?.content?.trim() ||
								message.snippet?.trim() ||
								"Текст письма недоступен в предпросмотре."}
						</p>
					)}

					{message.hasAttachments && (
						<div className="mt-3 flex flex-col gap-1.5">
							<span className="flex items-center gap-1 font-medium text-[11px] text-muted-foreground">
								<Paperclip className="size-3" /> Вложения
							</span>
							{detail.isLoading ? (
								<span className="text-muted-foreground text-xs">
									Загрузка вложений…
								</span>
							) : attachments.length === 0 ? (
								<span className="text-muted-foreground text-xs">
									Вложения недоступны.
								</span>
							) : (
								attachments.map((att) => (
									<button
										key={att.id}
										type="button"
										disabled={attachmentUrl.isPending}
										onClick={() =>
											attachmentUrl.mutate({ attachmentId: att.id })
										}
										className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-left transition-colors hover:bg-muted disabled:opacity-60"
										title={`${att.contentType} · скачать`}
									>
										<Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
										<span className="truncate font-medium text-xs">
											{att.filename}
										</span>
										<span className="shrink-0 text-[10px] text-muted-foreground">
											{formatSize(att.sizeBytes)}
										</span>
										<Download className="size-3 shrink-0 text-muted-foreground" />
									</button>
								))
							)}
						</div>
					)}
				</div>
			</AnimatedHeight>
		</div>
	);
}
