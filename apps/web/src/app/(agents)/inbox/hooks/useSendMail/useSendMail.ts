"use client";

import type { RouterInputs } from "@rox/trpc";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

export type SendMailInput = RouterInputs["mail"]["send"];

/**
 * Compose/reply via `mail.send`.
 *
 * On success the thread (when replying) + inbox list queries are invalidated so
 * the outbound row and reordered inbox appear (cache-first: existing rows stay
 * rendered throughout). Server gates surface as clear toasts: outbound disabled
 * (`PRECONDITION_FAILED`) and quota exhausted (`FORBIDDEN`). The disabled state
 * is also reflected back to the caller via `isOutboundDisabled` so the composer
 * can render a persistent banner rather than a transient toast alone.
 */
export function useSendMail() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const mutation = useMutation(
		trpc.mail.send.mutationOptions({
			onSuccess: async (_result, variables) => {
				const tasks = [
					queryClient.invalidateQueries({
						queryKey: trpc.mail.listThreads.queryKey({}),
					}),
				];
				if (variables.threadId) {
					tasks.push(
						queryClient.invalidateQueries({
							queryKey: trpc.mail.getThread.queryKey({
								threadId: variables.threadId,
							}),
						}),
					);
				}
				await Promise.all(tasks);
				toast.success("Письмо отправлено");
			},
			onError: (error) => {
				const code = error.data?.code;
				if (code === "PRECONDITION_FAILED") {
					toast.error("Отправка почты сейчас недоступна");
					return;
				}
				if (code === "FORBIDDEN") {
					toast.error("Недостаточно баланса Rox для отправки");
					return;
				}
				console.error("[useSendMail] send failed", error);
				toast.error("Не удалось отправить письмо");
			},
		}),
	);

	const isOutboundDisabled =
		mutation.error?.data?.code === "PRECONDITION_FAILED";

	return {
		send: (input: SendMailInput) => mutation.mutateAsync(input),
		isSending: mutation.isPending,
		isOutboundDisabled,
		reset: mutation.reset,
	};
}
