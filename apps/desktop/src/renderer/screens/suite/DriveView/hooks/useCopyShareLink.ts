import { toast } from "@rox/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";
import { buildShareUrl } from "../utils/buildShareUrl";

/**
 * "Копировать ссылку" — mint a public share for a file or folder and copy the
 * `app.rox.one/d/<token>` URL to the clipboard in one step (the context-menu
 * shortcut that skips the password dialog). Uses the imperative cloud tRPC
 * client (`apiTrpcClient.drive.createShare.mutate`) since this is a fire-and-
 * copy action, then invalidates the shares list so the manager stays current.
 */
export function useCopyShareLink() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	return useCallback(
		async (target: { fileId?: string; folderId?: string }) => {
			try {
				const share = await apiTrpcClient.drive.createShare.mutate(target);
				const token = share?.token;
				if (!token) throw new Error("Сервер не вернул токен ссылки");
				await navigator.clipboard.writeText(
					buildShareUrl(token, env.NEXT_PUBLIC_WEB_URL),
				);
				await queryClient.invalidateQueries({
					queryKey: trpc.drive.listShares.queryKey(),
				});
				toast.success("Ссылка скопирована");
			} catch (error) {
				logger.error("[DriveView] copy share link failed", error);
				toast.error(
					error instanceof Error ? error.message : "Не удалось создать ссылку",
				);
			}
		},
		[queryClient, trpc],
	);
}
