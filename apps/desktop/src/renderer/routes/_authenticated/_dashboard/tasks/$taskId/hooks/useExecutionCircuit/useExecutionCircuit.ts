import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

/**
 * Wraps the executionCircuit tRPC calls for the task-detail panel: load the
 * 1:1 draft circuit, generate a default draft, and copy a per-transition
 * compiled prompt to the clipboard. Read-only otherwise (foundation slice).
 */
export function useExecutionCircuit(taskId: string) {
	const queryClient = useQueryClient();
	const queryKey = ["execution-circuit", taskId];

	const circuitQuery = useQuery({
		queryKey,
		queryFn: () => apiTrpcClient.executionCircuit.getByTaskId.query({ taskId }),
		retry: false,
	});

	const generateDraft = useMutation({
		mutationFn: () =>
			apiTrpcClient.executionCircuit.createDraftForTask.mutate({ taskId }),
		onSuccess: (circuit) => {
			queryClient.setQueryData(queryKey, circuit);
		},
	});

	const [copiedTransitionId, setCopiedTransitionId] = useState<string | null>(
		null,
	);

	const copyPrompt = useCallback(
		async (transitionId: string) => {
			const compiled =
				await apiTrpcClient.executionCircuit.compileTransitionPrompt.query({
					taskId,
					transitionId,
				});
			await navigator.clipboard.writeText(compiled.prompt);
			setCopiedTransitionId(transitionId);
		},
		[taskId],
	);

	return {
		circuit: circuitQuery.data ?? null,
		isLoading: circuitQuery.isPending,
		isError: circuitQuery.isError,
		generateDraft: () => generateDraft.mutate(),
		isGenerating: generateDraft.isPending,
		copyPrompt,
		copiedTransitionId,
	};
}
