import {
	buildCreateTaskInput,
	type CreateTaskDraft,
	type CreateTaskInput,
} from "./buildCreateTaskInput";

export type CreateTaskMutate = (input: CreateTaskInput) => Promise<unknown>;

/**
 * Run the create-task mutation for a draft. Builds the payload, skips empty
 * drafts, and delegates the actual call to the injected `mutate` fn. Splitting
 * this from the hook keeps the payload + dispatch contract unit-testable without
 * the tRPC client. Returns true when a mutation was dispatched.
 */
export async function createTaskWith(
	mutate: CreateTaskMutate,
	draft: CreateTaskDraft,
): Promise<boolean> {
	const input = buildCreateTaskInput(draft);
	if (!input) return false;
	await mutate(input);
	return true;
}
