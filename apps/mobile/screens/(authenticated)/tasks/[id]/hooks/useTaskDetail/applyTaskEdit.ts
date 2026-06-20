import type { TaskPriority } from "@rox/db/enums";

export interface EditableTaskDraft {
	statusId: string;
	priority: TaskPriority;
}

/**
 * Apply a status change to a task draft. Pure so the optimistic-mutation field
 * write is unit-testable independently of the TanStack collection. Returns true
 * when the value actually changed (so callers can skip a no-op write).
 */
export function applyStatusChange(
	draft: EditableTaskDraft,
	statusId: string,
): boolean {
	if (draft.statusId === statusId) return false;
	draft.statusId = statusId;
	return true;
}

/**
 * Apply a priority change to a task draft. Returns true when it changed.
 */
export function applyPriorityChange(
	draft: EditableTaskDraft,
	priority: TaskPriority,
): boolean {
	if (draft.priority === priority) return false;
	draft.priority = priority;
	return true;
}
