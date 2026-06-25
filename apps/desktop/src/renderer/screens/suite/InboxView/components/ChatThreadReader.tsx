import { authClient } from "@rox/auth/client";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@rox/ui/alert-dialog";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Label } from "@rox/ui/label";
import { ScrollArea } from "@rox/ui/scroll-area";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { cn } from "@rox/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Send, Trash2 } from "lucide-react";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";
import { formatRelativeTime } from "../utils/inboxTime";
import { ThreadPresence } from "./ThreadPresence";

/** Idle window after the last keystroke before typing presence auto-clears. */
const TYPING_IDLE_MS = 2500;

export interface ChatThreadReaderProps {
	threadId: string;
	/** Ref so the keyboard layer can focus the composer on `r`. */
	composerRef: RefObject<HTMLTextAreaElement | null>;
}

/**
 * Reader + composer for an in-app chat thread inside the unified inbox. Ported
 * from the previous monolithic `ChatTab` reader half (`comms.getThread` bubbles,
 * `ThreadPresence`, throttled typing presence, `comms.sendMessage` / edit /
 * delete) so the unified inbox keeps the proven chat behavior while the list /
 * filtering / triage live one level up.
 *
 * Cache-first (AGENTS.md #9): edits/sends invalidate `getThread` + `listThreads`
 * so the authoritative row replaces the optimistic one without blanking.
 */
export function ChatThreadReader({
	threadId,
	composerRef,
}: ChatThreadReaderProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const session = authClient.useSession();
	const currentUserId = session.data?.user?.id;

	const [body, setBody] = useState("");

	// In-app dialog state replacing the native window.prompt / window.confirm:
	// `editing` holds the message under edit (with its draft body); `deletingId`
	// holds the id pending delete confirmation. Both close via setting to null.
	const [editing, setEditing] = useState<{ id: string; draft: string } | null>(
		null,
	);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const setTypingRef = useRef<(typing: boolean) => void>(() => {});
	const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isTypingRef = useRef(false);

	const handleTypingControl = useCallback(
		(setter: (typing: boolean) => void) => {
			setTypingRef.current = setter;
		},
		[],
	);

	const stopTyping = useCallback(() => {
		if (typingTimer.current) clearTimeout(typingTimer.current);
		if (isTypingRef.current) {
			isTypingRef.current = false;
			setTypingRef.current(false);
		}
	}, []);

	const handleComposerChange = useCallback(
		(value: string) => {
			setBody(value);
			if (!isTypingRef.current && value.length > 0) {
				isTypingRef.current = true;
				setTypingRef.current(true);
			}
			if (typingTimer.current) clearTimeout(typingTimer.current);
			typingTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
		},
		[stopTyping],
	);

	// Reset composer + typing on thread switch.
	// biome-ignore lint/correctness/useExhaustiveDependencies: must also re-run when the active thread changes.
	useEffect(() => {
		setBody("");
		return stopTyping;
	}, [stopTyping, threadId]);

	const threadQuery = useQuery(trpc.comms.getThread.queryOptions({ threadId }));
	const messages = threadQuery.data?.messages ?? [];
	const participants = threadQuery.data?.participants ?? [];

	const recipientUserIds = participants
		.map((p) => p.userId)
		.filter((id): id is string => Boolean(id) && id !== currentUserId);

	const invalidate = useCallback(async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.comms.getThread.queryKey({ threadId }),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.comms.listThreads.queryKey({ limit: 50 }),
			}),
		]);
	}, [queryClient, trpc, threadId]);

	const send = useMutation(
		trpc.comms.sendMessage.mutationOptions({
			onSuccess: async () => {
				setBody("");
				stopTyping();
				await invalidate();
			},
			onError: (error) => {
				logger.error("[InboxView] sendMessage failed", error);
				toast.error("Не удалось отправить сообщение");
			},
		}),
	);

	const editMessage = useMutation(
		trpc.comms.editMessage.mutationOptions({
			onSuccess: async () => {
				setEditing(null);
				await invalidate();
			},
			onError: (error) => {
				logger.error("[InboxView] editMessage failed", error);
				toast.error("Не удалось изменить сообщение");
			},
		}),
	);
	const deleteMessage = useMutation(
		trpc.comms.deleteMessage.mutationOptions({
			onSuccess: async () => {
				setDeletingId(null);
				await invalidate();
			},
			onError: (error) => {
				logger.error("[InboxView] deleteMessage failed", error);
				toast.error("Не удалось удалить сообщение");
			},
		}),
	);

	// Open → mark read (optimistic, cache-first). Watermark = the newest message
	// id in the loaded thread; invalidates listThreads so the unread badge clears.
	const markRead = useMutation(
		trpc.comms.markRead.mutationOptions({
			onSuccess: () =>
				queryClient.invalidateQueries({
					queryKey: trpc.comms.listThreads.queryKey({ limit: 50 }),
				}),
			onError: (error) =>
				logger.error("[InboxView] comms markRead failed", error),
		}),
	);
	const lastMessageId = messages.at(-1)?.id ?? null;
	const markReadMutate = markRead.mutate;
	// biome-ignore lint/correctness/useExhaustiveDependencies: fire once per thread/newest-message, not on every mutation identity change.
	useEffect(() => {
		if (lastMessageId) {
			markReadMutate({ threadId, lastReadMessageId: lastMessageId });
		}
	}, [threadId, lastMessageId]);

	const openEditDialog = (id: string, currentBody: string) => {
		setEditing({ id, draft: currentBody });
	};
	const submitEdit = () => {
		if (!editing) return;
		const trimmed = editing.draft.trim();
		if (trimmed.length === 0) return;
		// No-op edits just close the dialog; nothing to persist.
		const original = messages.find((m) => m.id === editing.id)?.body;
		if (trimmed === original) {
			setEditing(null);
			return;
		}
		editMessage.mutate({ messageId: editing.id, body: trimmed });
	};
	const confirmDelete = () => {
		if (!deletingId) return;
		deleteMessage.mutate({ messageId: deletingId });
	};

	const bottomRef = useRef<HTMLDivElement>(null);
	const messageCount = messages.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll must re-run on new message / thread switch.
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ block: "end" });
	}, [messageCount, threadId]);

	const canSend =
		body.trim().length > 0 && !send.isPending && recipientUserIds.length > 0;

	const handleSend = () => {
		if (!canSend) return;
		send.mutate({
			threadId,
			recipients: recipientUserIds.map((userId) => ({
				kind: "userId" as const,
				userId,
			})),
			body: body.trim(),
		});
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			<header className="flex shrink-0 items-center justify-end gap-3 border-white/5 border-b px-4 py-2.5">
				<ThreadPresence
					threadId={threadId}
					onTypingControl={handleTypingControl}
				/>
			</header>

			<ScrollArea className="min-h-0 flex-1">
				<div className="p-4">
					{threadQuery.isError ? (
						<p className="cursor-text select-text text-destructive text-sm">
							{threadQuery.error.message}
						</p>
					) : threadQuery.isLoading && messages.length === 0 ? (
						<div className="space-y-3">
							<Skeleton className="h-12 w-2/3 rounded-2xl" />
							<Skeleton className="h-12 w-1/2 rounded-2xl" />
						</div>
					) : messages.length === 0 ? (
						<p className="py-8 text-center text-muted-foreground text-xs">
							Сообщений пока нет — напишите первое.
						</p>
					) : (
						<div className="flex flex-col gap-3">
							{messages.map((message) => {
								const isOwn =
									!!currentUserId && message.authorUserId === currentUserId;
								const isDeleted = Boolean(message.deletedAt);
								const isEdited = Boolean(message.editedAt);
								const showActions = isOwn && !isDeleted;
								return (
									<div
										key={message.id}
										className={cn(
											"group flex flex-col",
											isOwn ? "items-end" : "items-start",
										)}
									>
										<div className="flex items-center gap-1">
											{showActions && (
												<div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
													<Button
														type="button"
														size="icon"
														variant="ghost"
														className="size-6"
														aria-label="Изменить"
														onClick={() =>
															openEditDialog(message.id, message.body)
														}
													>
														<Pencil className="size-3.5" />
													</Button>
													<Button
														type="button"
														size="icon"
														variant="ghost"
														className="size-6"
														aria-label="Удалить"
														onClick={() => setDeletingId(message.id)}
													>
														<Trash2 className="size-3.5" />
													</Button>
												</div>
											)}
											<div
												className={cn(
													"max-w-[80%] rounded-2xl px-3 py-2 text-sm",
													isOwn
														? "bg-primary text-primary-foreground"
														: "bg-muted text-foreground",
												)}
											>
												{isDeleted ? (
													<p className="cursor-text select-text text-muted-foreground italic">
														Сообщение удалено
													</p>
												) : (
													<p className="cursor-text select-text whitespace-pre-wrap break-words">
														{message.body}
													</p>
												)}
											</div>
										</div>
										<span className="mt-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
											{formatRelativeTime(message.createdAt)}
											{!isDeleted && isEdited && " · изменено"}
										</span>
									</div>
								);
							})}
							<div ref={bottomRef} />
						</div>
					)}
				</div>
			</ScrollArea>

			<div className="shrink-0 border-white/5 border-t p-3">
				<div className="flex items-end gap-2">
					<Textarea
						ref={composerRef}
						value={body}
						onChange={(e) => handleComposerChange(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								handleSend();
							}
						}}
						placeholder={
							recipientUserIds.length === 0
								? "В этой переписке некому ответить"
								: "Сообщение…"
						}
						rows={1}
						disabled={recipientUserIds.length === 0}
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

			<Dialog
				open={editing !== null}
				onOpenChange={(next) => {
					if (!next) setEditing(null);
				}}
			>
				<DialogContent className="max-w-[420px]">
					<DialogHeader>
						<DialogTitle>Изменить сообщение</DialogTitle>
						<DialogDescription>
							Отредактируйте текст и сохраните изменения.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="inbox-edit-body">Сообщение</Label>
						<Textarea
							id="inbox-edit-body"
							value={editing?.draft ?? ""}
							onChange={(e) =>
								setEditing((prev) =>
									prev ? { ...prev, draft: e.target.value } : prev,
								)
							}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									submitEdit();
								}
							}}
							rows={4}
							className="resize-none"
						/>
					</div>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => setEditing(null)}
							disabled={editMessage.isPending}
						>
							Отмена
						</Button>
						<Button
							onClick={submitEdit}
							disabled={
								editMessage.isPending ||
								(editing?.draft.trim().length ?? 0) === 0
							}
						>
							{editMessage.isPending ? "Сохранение…" : "Сохранить"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={deletingId !== null}
				onOpenChange={(next) => {
					if (!next) setDeletingId(null);
				}}
			>
				<AlertDialogContent className="max-w-[340px]">
					<AlertDialogHeader>
						<AlertDialogTitle>Удалить это сообщение?</AlertDialogTitle>
						<AlertDialogDescription>
							Сообщение будет помечено как удалённое для всех участников
							переписки.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="flex-row justify-end gap-2">
						<Button
							variant="ghost"
							onClick={() => setDeletingId(null)}
							disabled={deleteMessage.isPending}
						>
							Отмена
						</Button>
						<Button
							variant="destructive"
							onClick={confirmDelete}
							disabled={deleteMessage.isPending}
						>
							{deleteMessage.isPending ? "Удаление…" : "Удалить"}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
