import { Button } from "@rox/ui/button";
import { Separator } from "@rox/ui/separator";
import { Textarea } from "@rox/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { LuMessageSquare, LuSend } from "react-icons/lu";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";
import {
	COMMENT_MAX_LENGTH,
	canSubmitComment,
	type PanelComment,
	sortCommentsOldestFirst,
} from "./comments-helpers";

export interface CommentsSectionProps {
	/** The object the thread is anchored to. */
	entityId: string;
	/** Project scope to denormalize onto a freshly-created thread (optional). */
	v2ProjectId?: string;
}

/**
 * Durable comment thread on a Project-OS object (#11,
 * `collaboration.threadsAsObjects`). Lists the object's comments (oldest first)
 * and a compose box to append one. Reuses the cloud graph router:
 *  - `graph.comments.list`   → the object's comments,
 *  - `graph.comments.create` → append a comment (author = caller, server-side).
 *
 * Mounted behind `ExperimentalFeatureGate` in {@link ObjectDetailsPanel}, so it
 * only renders once the experiment resolves `available`.
 */
export function CommentsSection({
	entityId,
	v2ProjectId,
}: CommentsSectionProps) {
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
			onError: (error: unknown) => {
				logger.error("[ProjectObjectGraph] comment create failed", error);
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
		<section className="space-y-2" aria-label="Комментарии">
			<div className="flex items-center gap-2">
				<LuMessageSquare
					className="size-3.5 text-muted-foreground"
					aria-hidden
				/>
				<p className="text-xs font-medium text-muted-foreground">Комментарии</p>
			</div>

			{commentsQuery.isLoading ? (
				<p className="text-xs text-muted-foreground/70">Загрузка…</p>
			) : comments.length === 0 ? (
				<p className="text-xs text-muted-foreground/70">
					Пока нет комментариев. Будьте первым.
				</p>
			) : (
				<ul className="space-y-1.5" data-testid="object-comments-list">
					{comments.map((comment) => (
						<li
							key={comment.id}
							className="rounded-md border border-border/50 px-2.5 py-1.5"
						>
							<p className="whitespace-pre-wrap break-words text-sm">
								{comment.body}
							</p>
						</li>
					))}
				</ul>
			)}

			<Separator />

			<div className="space-y-1.5">
				<Textarea
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder="Добавить комментарий…"
					maxLength={COMMENT_MAX_LENGTH}
					rows={2}
					className="min-h-[2.5rem] text-sm"
					aria-label="Новый комментарий"
				/>
				<div className="flex justify-end">
					<Button
						type="button"
						size="sm"
						onClick={handleSubmit}
						disabled={!submittable}
					>
						<LuSend className="size-3.5" aria-hidden />
						Отправить
					</Button>
				</div>
			</div>
		</section>
	);
}
