import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	type TaskLinkRow,
	type TaskLinkTargetKind,
	taskLinkId,
} from "./schema";

interface UpsertTaskLinkInput {
	projectId: string;
	taskId: string;
	kind: TaskLinkTargetKind;
	targetNumber: number;
	targetTitle: string;
	targetUrl: string;
}

export interface UseTaskLinksResult {
	/** All links for the given task (PRs + issues). */
	linksForTask: TaskLinkRow[];
	/** All links pointing at a given PR/issue number (the task side). */
	linksForTarget: TaskLinkRow[];
	/** Create or replace a link (idempotent on the composite id). */
	upsertLink: (input: UpsertTaskLinkInput) => void;
	/** Remove a link by its composite id. */
	removeLink: (id: string) => void;
}

/**
 * Cross-chip linkage hook over the local-only `taskLinks` react-db collection.
 *
 * Both query directions are exposed so the same model drives the chips on the
 * task detail (`linksForTask`) and on a PR/issue row or detail
 * (`linksForTarget`). Pass only the side you need; the unused direction stays
 * cheap because the live queries are filtered server-side by the collection
 * index.
 */
export function useTaskLinks(params: {
	taskId?: string;
	target?: { kind: TaskLinkTargetKind; targetNumber: number };
}): UseTaskLinksResult {
	const collections = useCollections();
	const { taskId, target } = params;

	const { data: linksForTask } = useLiveQuery(
		(q) =>
			q
				.from({ taskLinks: collections.taskLinks })
				.where(({ taskLinks }) => eq(taskLinks.taskId, taskId ?? "")),
		[collections, taskId],
	);

	const { data: linksForTarget } = useLiveQuery(
		(q) =>
			q
				.from({ taskLinks: collections.taskLinks })
				.where(({ taskLinks }) =>
					eq(taskLinks.targetNumber, target?.targetNumber ?? -1),
				),
		[collections, target?.targetNumber],
	);

	const upsertLink = useCallback(
		(input: UpsertTaskLinkInput) => {
			const id = taskLinkId(input);
			const existing = collections.taskLinks.get(id);
			if (existing) {
				collections.taskLinks.update(id, (draft) => {
					draft.targetTitle = input.targetTitle;
					draft.targetUrl = input.targetUrl;
				});
				return;
			}
			collections.taskLinks.insert({
				id,
				projectId: input.projectId,
				taskId: input.taskId,
				kind: input.kind,
				targetNumber: input.targetNumber,
				targetTitle: input.targetTitle,
				targetUrl: input.targetUrl,
				createdAt: new Date(),
			});
		},
		[collections],
	);

	const removeLink = useCallback(
		(id: string) => {
			if (collections.taskLinks.get(id)) {
				collections.taskLinks.delete(id);
			}
		},
		[collections],
	);

	// `target.kind` narrows the target-direction result so a PR row never shows
	// an issue link that happens to share a number.
	const targetLinks = (linksForTarget ?? []).filter((link) =>
		target ? link.kind === target.kind : true,
	);

	return {
		linksForTask: linksForTask ?? [],
		linksForTarget: targetLinks,
		upsertLink,
		removeLink,
	};
}
