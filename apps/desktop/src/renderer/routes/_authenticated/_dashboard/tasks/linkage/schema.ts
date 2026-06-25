import { z } from "zod";

/**
 * Headless, transport-agnostic cross-link model for the Tasks power-user layer.
 *
 * A `TaskLink` is a local-only association between a task and a GitHub PR or
 * issue inside one project. The model is intentionally platform-neutral
 * (web/mobile/desktop shells reuse it): it carries only the identifiers and the
 * denormalized title/url needed to render a clickable chip without re-fetching.
 *
 * Stored on `@tanstack/react-db` via a `localStorageCollectionOptions`
 * collection (mirrors the other v2 local-only collections). Keyed by a stable
 * composite id so the same task↔target pair never duplicates.
 */

const persistedDateSchema = z
	.union([z.string(), z.date()])
	.transform((value) => (typeof value === "string" ? new Date(value) : value));

export type TaskLinkTargetKind = "pr" | "issue";

export const taskLinkSchema = z.object({
	/** Stable composite id: `${projectId}:${taskId}:${kind}:${targetNumber}`. */
	id: z.string(),
	/** v2 project the PR/issue lives under (cross-chips are project-scoped). */
	projectId: z.string(),
	/** Task UUID this link belongs to. */
	taskId: z.string(),
	/** What the task is linked to. */
	kind: z.enum(["pr", "issue"]),
	/** PR or issue number within the project repo. */
	targetNumber: z.number().int().positive(),
	/** Denormalized title for chip rendering (no re-fetch needed). */
	targetTitle: z.string(),
	/** Denormalized GitHub URL for "open in browser" affordances. */
	targetUrl: z.string(),
	createdAt: persistedDateSchema,
});

export type TaskLinkRow = z.infer<typeof taskLinkSchema>;

/** Build the stable composite key for a task↔target link. */
export function taskLinkId(params: {
	projectId: string;
	taskId: string;
	kind: TaskLinkTargetKind;
	targetNumber: number;
}): string {
	return `${params.projectId}:${params.taskId}:${params.kind}:${params.targetNumber}`;
}
