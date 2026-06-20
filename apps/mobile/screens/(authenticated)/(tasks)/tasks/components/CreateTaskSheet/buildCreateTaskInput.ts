import type { TaskPriority } from "@rox/db/enums";

export interface CreateTaskDraft {
	title: string;
	description?: string;
	priority?: TaskPriority;
	statusId?: string | null;
}

export interface CreateTaskInput {
	title: string;
	priority: TaskPriority;
	description?: string;
	statusId?: string;
}

/**
 * Build the `task.create` mutation payload from the sheet draft. Pure so the
 * payload contract is unit-testable without the tRPC client. Returns null when
 * the title is empty (the create action is a no-op in that case).
 */
export function buildCreateTaskInput(
	draft: CreateTaskDraft,
): CreateTaskInput | null {
	const title = draft.title.trim();
	if (!title) return null;

	const input: CreateTaskInput = {
		title,
		priority: draft.priority ?? "none",
	};

	const description = draft.description?.trim();
	if (description) input.description = description;

	if (draft.statusId) input.statusId = draft.statusId;

	return input;
}
