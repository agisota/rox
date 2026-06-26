/**
 * Adapter hook: "Открыть в Finder" / open repo URL for the Skills library.
 *
 * Bridges the renderer to the existing electron-tRPC `external` router
 * (`external.openInFinder` → `shell.showItemInFolder`, `external.openUrl` →
 * scheme-guarded `shell.openExternal`). No new backend procedures and no shared
 * files are touched — these procedures already exist and are renderer-safe.
 */

import { toast } from "@rox/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function useExternalActions() {
	const openInFinder = electronTrpc.external.openInFinder.useMutation({
		onError: (error) =>
			toast.error(`Не удалось открыть в Finder: ${error.message}`),
	});
	const openUrl = electronTrpc.external.openUrl.useMutation({
		onError: (error) =>
			toast.error(`Не удалось открыть ссылку: ${error.message}`),
	});

	return {
		/** Reveal a file/dir in the OS file manager (Finder/Explorer). */
		revealInFinder: (absolutePath: string) => openInFinder.mutate(absolutePath),
		/** Open an external URL (repo link) in the default browser. */
		openExternalUrl: (url: string) => openUrl.mutate(url),
		isRevealing: openInFinder.isPending,
	};
}
