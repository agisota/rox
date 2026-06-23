"use client";

import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { Textarea } from "@rox/ui/textarea";
import { Send, X } from "lucide-react";
import { useState } from "react";

import { useSendMail } from "../../../hooks/useSendMail";
import type { MailReplyContext } from "../../../utils/mailReplyContext";

export interface MailComposerProps {
	/** Reply context (thread id + headers) when replying; null for a new email. */
	reply?: {
		threadId: string;
		context: MailReplyContext;
	} | null;
	/** Called after a successful send so the parent can close/reset the composer. */
	onSent: () => void;
	/** Cancel the composer without sending. */
	onCancel: () => void;
}

/** Parse a comma/space-separated recipient list into trimmed addresses. */
function parseRecipients(value: string): string[] {
	return value
		.split(/[,;\s]+/)
		.map((s) => s.trim())
		.filter(Boolean);
}

/**
 * The email composer — used for both a fresh email and a threaded reply.
 *
 * Replies prefill To + Subject from the derived {@link MailReplyContext} and pass
 * `threadId` + `inReplyTo` + `references` so the server appends to the existing
 * thread with correct RFC headers. Sending is gated server-side; when outbound is
 * disabled the send surfaces a persistent banner (via `isOutboundDisabled`) in
 * addition to a toast.
 */
export function MailComposer({ reply, onSent, onCancel }: MailComposerProps) {
	const { send, isSending, isOutboundDisabled } = useSendMail();

	const [to, setTo] = useState(reply?.context.to ?? "");
	const [subject, setSubject] = useState(reply?.context.subject ?? "");
	const [body, setBody] = useState("");

	const recipients = parseRecipients(to);
	const canSend = recipients.length > 0 && body.trim().length > 0 && !isSending;

	const handleSend = async () => {
		if (!canSend) return;
		try {
			await send({
				threadId: reply?.threadId ?? null,
				to: recipients,
				subject: subject.trim() || undefined,
				body: body.trim(),
				inReplyTo: reply?.context.inReplyTo ?? null,
				references: reply?.context.references,
			});
			setBody("");
			if (!reply) {
				setTo("");
				setSubject("");
			}
			onSent();
		} catch {
			// Errors are surfaced via the hook's toast + banner; keep the draft.
		}
	};

	return (
		<div className="flex flex-col gap-2 border-t bg-card p-3">
			<div className="flex items-center justify-between">
				<span className="text-xs font-semibold">
					{reply ? "Ответ" : "Новое письмо"}
				</span>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-6"
					aria-label="Закрыть"
					onClick={onCancel}
				>
					<X className="size-3.5" />
				</Button>
			</div>

			{isOutboundDisabled && (
				<p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
					Отправка почты сейчас отключена. Письмо можно составить, но не
					отправить.
				</p>
			)}

			<div className="flex flex-col gap-1">
				<Label htmlFor="mail-to" className="text-[11px]">
					Кому
				</Label>
				<Input
					id="mail-to"
					value={to}
					onChange={(e) => setTo(e.target.value)}
					placeholder="name@example.com"
					className="h-8 text-sm"
				/>
			</div>

			<div className="flex flex-col gap-1">
				<Label htmlFor="mail-subject" className="text-[11px]">
					Тема
				</Label>
				<Input
					id="mail-subject"
					value={subject}
					onChange={(e) => setSubject(e.target.value)}
					placeholder="Тема письма"
					className="h-8 text-sm"
				/>
			</div>

			<Textarea
				value={body}
				onChange={(e) => setBody(e.target.value)}
				placeholder="Текст письма…"
				rows={4}
				className="max-h-48 min-h-20 resize-none text-sm"
			/>

			<div className="flex justify-end">
				<Button
					type="button"
					size="sm"
					className="gap-1.5"
					disabled={!canSend}
					onClick={handleSend}
				>
					<Send className="size-3.5" />
					{isSending ? "Отправка…" : "Отправить"}
				</Button>
			</div>
		</div>
	);
}
