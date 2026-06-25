"use client";

import {
	COMMENT_MAX_LENGTH,
	canSubmitComment,
	type PanelComment,
	sortCommentsOldestFirst,
} from "@rox/shared/object-comments";
import { Button } from "@rox/ui/button";
import { Separator } from "@rox/ui/separator";
import { Skeleton } from "@rox/ui/skeleton";
import { Textarea } from "@rox/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { useMemo, useState } from "react";

import { useTRPC } from "@/trpc/react";

export interface ObjectCommentsPanelProps {
	/** The object the thread is anchored to (an `entities.id`). */
	entityId: string;
	/** Project scope to denormalize onto a freshly-created thread (optional). */
	v2ProjectId?: string;
}

/**
 * Durable comment thread on a Project-OS object
 * (`collaboration.threadsAsObjects`) — the web `(agents)` parity of the desktop
 * `ProjectObjectGraph/CommentsSection`. Lists the object's comments (oldest
 * first) and a compose box to append one, entirely over the shipped cloud graph
 * router — no migration:
 *   - `graph.comments.list`   → the object's comments,
 *   - `graph.comments.create` → append a comment (author = caller, server-side).
 *
 * The list/compose logic is the cross-platform core in
 * `@rox/shared/object-comments` shared with desktop. Mounted only once
 * {@link resolveThreadsAsObjectsGate} opens (active org + the experimental
 * feature resolves `available`), so the org scope on the router
 * (`requireActiveOrgMembership`) always has a caller.
 */
export function ObjectCommentsPanel({
	entityId,
	v2ProjectId,
}: ObjectCommentsPanelProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState("");

	const commentsQuery = useQuery(
		trpc.graph.comments.list.queryOptions({ entityId }),
	);

	const comments = useMemo<PanelComment[]>(
		() => sortCommentsOldestFirst(commentsQuery.data ?? []),
		[commentsQuery.data],
	);

	const createMutation = useMutation(
		trpc.graph.comments.create.mutationOptions({
			onSuccess: async () => {
				setDraft("");
				await queryClient.invalidateQueries({
					queryKey: trpc.graph.comments.list.queryKey({ entityId }),
				});
			},
		}),
	);

	const submittable = canSubmitComment(draft, createMutation.isPending);

	const handleSubmit = () => {
		if (!submittable) return;
		createMutation.mutate({
			entityId,
			body: draft.trim(),
			...(v2ProjectId ? { v2ProjectId } : {}),
		});
	};

	return (
		<section className="space-y-3" aria-label="Комментарии">
			<div className="flex items-center gap-2">
				<MessageSquare className="size-5 text-muted-foreground" />
				<div>
					<h2 className="font-semibold text-lg">Комментарии</h2>
					<p className="text-muted-foreground text-sm">
						Долговечная ветка обсуждения, привязанная к объекту проекта.
					</p>
				</div>
			</div>

			{commentsQuery.isLoading ? (
				<div className="space-y-2">
					<Skeleton className="h-12 w-full rounded-md" />
					<Skeleton className="h-12 w-full rounded-md" />
				</div>
			) : commentsQuery.isError ? (
				<div className="rounded-lg border border-destructive/40 p-4 text-sm">
					<p className="text-destructive">Не удалось загрузить комментарии.</p>
					<button
						type="button"
						onClick={() => void commentsQuery.refetch()}
						className="mt-2 text-muted-foreground underline underline-offset-4 hover:text-foreground"
					>
						Повторить
					</button>
				</div>
			) : comments.length === 0 ? (
				<p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
					Пока нет комментариев. Будьте первым.
				</p>
			) : (
				<ul className="space-y-2" data-testid="object-comments-list">
					{comments.map((comment) => (
						<li
							key={comment.id}
							className="rounded-md border border-border/60 px-3 py-2"
						>
							<p className="whitespace-pre-wrap break-words text-sm">
								{comment.body}
							</p>
						</li>
					))}
				</ul>
			)}

			<Separator />

			<div className="space-y-2">
				<Textarea
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder="Добавить комментарий…"
					maxLength={COMMENT_MAX_LENGTH}
					rows={2}
					className="min-h-[2.5rem] text-sm"
					aria-label="Новый комментарий"
				/>
				{createMutation.isError ? (
					<p className="text-destructive text-xs">
						Не удалось отправить комментарий. Попробуйте ещё раз.
					</p>
				) : null}
				<div className="flex justify-end">
					<Button
						type="button"
						size="sm"
						onClick={handleSubmit}
						disabled={!submittable}
					>
						<Send className="size-3.5" aria-hidden />
						Отправить
					</Button>
				</div>
			</div>
		</section>
	);
}
