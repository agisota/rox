"use client";

import { Button } from "@rox/ui/button";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Send } from "lucide-react";
import { useRef, useState } from "react";

import { useTRPC } from "@/trpc/react";
import { useComposerAttachments } from "../../hooks/useComposerAttachments";
import { useThreadTyping } from "../../hooks/useThreadTyping";
import { AttachmentChip } from "../AttachmentChip";

export interface ComposerProps {
	threadId: string;
	/**
	 * The thread's participant user ids — used as `recipients` for the in-app
	 * send (the schema requires at least one recipient even when appending). The
	 * author is excluded by the caller.
	 */
	recipientUserIds: string[];
	/**
	 * Broadcast typing presence. Wired from `ThreadPresence`; defaults to a no-op
	 * so the composer works even when the presence layer is inert.
	 */
	onTypingChange?: (typing: boolean) => void;
}

/**
 * The message composer: a growable textarea, Drive-backed attachments, and a
 * send wired to `comms.sendMessage`. On success it invalidates the thread + inbox
 * queries so the new message and the reordered inbox appear (cache-first: the
 * existing messages stay rendered throughout).
 *
 * Typing presence is debounced — it fires `onTypingChange(true)` on keystroke and
 * `false` after a short idle (or on send), so the LiveBlocks typing indicator is
 * not spammed.
 */
export function Composer({
	threadId,
	recipientUserIds,
	onTypingChange,
}: ComposerProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [body, setBody] = useState("");
	const { onChange: onTyping, stop: stopTyping } =
		useThreadTyping(onTypingChange);

	const {
		attachments,
		pending,
		error: attachmentError,
		isUploading,
		addFiles,
		removeAttachment,
		clear,
	} = useComposerAttachments();

	const fileInputRef = useRef<HTMLInputElement>(null);

	const sendMutation = useMutation(
		trpc.comms.sendMessage.mutationOptions({
			onSuccess: async () => {
				setBody("");
				clear();
				stopTyping();
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.comms.getThread.queryKey({ threadId }),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.comms.listThreads.queryKey({}),
					}),
				]);
			},
			onError: (err) => {
				console.error("[Composer] sendMessage failed", err);
				toast.error("Не удалось отправить сообщение");
			},
		}),
	);

	const handleTyping = (value: string) => {
		setBody(value);
		onTyping(value);
	};

	const canSend =
		(body.trim().length > 0 || attachments.length > 0) &&
		!sendMutation.isPending &&
		!isUploading &&
		recipientUserIds.length > 0;

	const handleSend = () => {
		if (!canSend) return;
		sendMutation.mutate({
			threadId,
			recipients: recipientUserIds.map((userId) => ({
				kind: "userId" as const,
				userId,
			})),
			body: body.trim() || " ",
			attachments: attachments.map((a) => ({
				name: a.name,
				url: a.url,
				contentType: a.contentType,
				size: a.size,
			})),
		});
	};

	return (
		<div className="border-t p-3">
			{(attachments.length > 0 || pending.length > 0) && (
				<div className="mb-2 flex flex-wrap gap-1.5">
					{attachments.map((a) => (
						<AttachmentChip
							key={a.localId}
							name={a.name}
							size={a.size}
							onRemove={() => removeAttachment(a.localId)}
						/>
					))}
					{pending.map((p) => (
						<AttachmentChip
							key={p.localId}
							name={p.name}
							size={p.size}
							uploading
						/>
					))}
				</div>
			)}

			{attachmentError && (
				<p className="mb-2 text-xs text-destructive">{attachmentError}</p>
			)}

			<div className="flex items-end gap-2">
				<input
					ref={fileInputRef}
					type="file"
					multiple
					className="hidden"
					onChange={(e) => {
						if (e.target.files && e.target.files.length > 0) {
							void addFiles(e.target.files);
						}
						e.target.value = "";
					}}
				/>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-9 shrink-0"
					aria-label="Прикрепить файл"
					onClick={() => fileInputRef.current?.click()}
				>
					<Paperclip className="size-4" />
				</Button>

				<Textarea
					value={body}
					onChange={(e) => handleTyping(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleSend();
						}
					}}
					placeholder="Сообщение…"
					rows={1}
					className="max-h-32 min-h-9 flex-1 resize-none"
				/>

				<Button
					type="button"
					size="icon"
					className="size-9 shrink-0"
					aria-label="Отправить"
					disabled={!canSend}
					onClick={handleSend}
				>
					<Send className="size-4" />
				</Button>
			</div>
		</div>
	);
}
