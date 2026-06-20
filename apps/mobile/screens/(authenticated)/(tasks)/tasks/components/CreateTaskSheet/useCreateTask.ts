import { useCallback, useState } from "react";
import { apiClient } from "@/lib/trpc/client";
import type { CreateTaskDraft } from "./buildCreateTaskInput";
import { createTaskWith } from "./createTaskWith";

interface UseCreateTaskResult {
	submit: (draft: CreateTaskDraft) => Promise<boolean>;
	isSubmitting: boolean;
	error: string | null;
}

/**
 * Create a task via the tRPC client. Electric reconciles the new row back into
 * the live collection, so there is nothing else to wire on the read side.
 */
export function useCreateTask(): UseCreateTaskResult {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = useCallback(async (draft: CreateTaskDraft) => {
		setIsSubmitting(true);
		setError(null);
		try {
			return await createTaskWith(
				(input) => apiClient.task.create.mutate(input),
				draft,
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create task");
			return false;
		} finally {
			setIsSubmitting(false);
		}
	}, []);

	return { submit, isSubmitting, error };
}
